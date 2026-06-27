import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

// Bound the in-memory fallback so it can't grow without limit (the Redis path
// is bounded by the server's maxmemory + LRU policy instead).
const MEMORY_MAX_ENTRIES = 5000;

/**
 * JSON key/value cache with a TTL. Backed by Redis when REDIS_URL is set and
 * reachable, and by a bounded in-memory Map otherwise — so the API keeps
 * running (just with a cold, per-instance cache) without any infra, mirroring
 * the graceful degradation of EventsService.
 *
 * Keys are namespaced with a "flowpedia:" prefix so the instance can safely
 * share a Redis server with other apps.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis?: Redis;
  private readonly memory = new Map<string, MemoryEntry>();
  private readonly prefix = "flowpedia:";

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>("REDIS_URL");
    if (!url) {
      this.logger.log("No REDIS_URL set — cache is in-memory only.");
      return;
    }

    const client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      // Give up reconnecting after a few tries so a dead Redis never blocks boot.
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 1000)),
    });
    // ioredis emits 'error' on every failed (re)connection attempt; swallow it
    // so a Redis outage doesn't spam logs or crash the process.
    client.on("error", () => undefined);

    try {
      await client.connect();
      await client.ping();
      this.redis = client;
      this.logger.log("Connected to Redis — cache is shared and survives restarts.");
    } catch (err) {
      this.logger.warn(`Redis unavailable — cache is in-memory only (${String(err)})`);
      client.disconnect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }

  /** Returns the cached value, or undefined on a miss / expired entry / error. */
  async get<T>(key: string): Promise<T | undefined> {
    const k = this.prefix + key;
    if (this.redis) {
      try {
        const raw = await this.redis.get(k);
        return raw ? (JSON.parse(raw) as T) : undefined;
      } catch (err) {
        this.logger.warn(`Redis get failed for ${key} (${String(err)})`);
        return undefined;
      }
    }
    return this.getMemory<T>(k);
  }

  /** Caches a JSON-serializable value for `ttlMs`. Failures never throw. */
  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const k = this.prefix + key;
    const raw = JSON.stringify(value);
    if (this.redis) {
      try {
        await this.redis.set(k, raw, "PX", ttlMs);
      } catch (err) {
        this.logger.warn(`Redis set failed for ${key} (${String(err)})`);
      }
      return;
    }
    this.setMemory(k, raw, ttlMs);
  }

  private getMemory<T>(k: string): T | undefined {
    const entry = this.memory.get(k);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(k);
      return undefined;
    }
    return JSON.parse(entry.value) as T;
  }

  private setMemory(k: string, raw: string, ttlMs: number): void {
    if (this.memory.size >= MEMORY_MAX_ENTRIES && !this.memory.has(k)) {
      // Drop the oldest entry (Map preserves insertion order).
      const oldest = this.memory.keys().next().value;
      if (oldest !== undefined) {
        this.memory.delete(oldest);
      }
    }
    this.memory.set(k, { value: raw, expiresAt: Date.now() + ttlMs });
  }
}
