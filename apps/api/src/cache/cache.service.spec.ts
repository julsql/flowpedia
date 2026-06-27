import { ConfigService } from "@nestjs/config";
import { CacheService } from "./cache.service";

/** Config stub with no REDIS_URL → exercises the in-memory fallback path. */
function memoryOnlyConfig(): ConfigService {
  return { get: (key: string) => (key === "REDIS_URL" ? undefined : undefined) } as ConfigService;
}

async function makeCache(): Promise<CacheService> {
  const cache = new CacheService(memoryOnlyConfig());
  await cache.onModuleInit(); // no REDIS_URL → stays in-memory
  return cache;
}

describe("CacheService (in-memory fallback)", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns undefined on a miss", async () => {
    const cache = await makeCache();
    expect(await cache.get("nope")).toBeUndefined();
  });

  it("round-trips a JSON-serializable value", async () => {
    const cache = await makeCache();
    const value = { titles: ["A", "B"], n: 2 };
    await cache.set("key", value, 60_000);
    expect(await cache.get("key")).toEqual(value);
  });

  it("returns undefined once the TTL has elapsed", async () => {
    jest.useFakeTimers();
    const cache = await makeCache();
    await cache.set("key", "value", 1_000);

    jest.advanceTimersByTime(999);
    expect(await cache.get<string>("key")).toBe("value");

    jest.advanceTimersByTime(2);
    expect(await cache.get("key")).toBeUndefined();
  });

  it("keeps entries under distinct keys independent", async () => {
    const cache = await makeCache();
    await cache.set("a", 1, 60_000);
    await cache.set("b", 2, 60_000);
    expect(await cache.get("a")).toBe(1);
    expect(await cache.get("b")).toBe(2);
  });

  it("returns a deep copy, not a shared reference", async () => {
    const cache = await makeCache();
    const value = { list: [1, 2] };
    await cache.set("key", value, 60_000);
    value.list.push(3); // mutate after caching

    expect(await cache.get<typeof value>("key")).toEqual({ list: [1, 2] });
  });
});
