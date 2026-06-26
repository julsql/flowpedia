import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SEEN_KEY = "flowpedia.seen";
// How long a shown article stays "recently seen" (so it isn't re-served soon),
// and how many ids we keep at most.
const SEEN_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const SEEN_MAX = 400;

interface SeenEntry {
  id: string;
  ts: number;
}

interface SeenValue {
  /** Ids shown recently (within the TTL), most relevant for exclusion. */
  seenIds: string[];
  /** Mark articles as shown in the flow. */
  markSeen: (ids: string[]) => void;
}

const SeenContext = createContext<SeenValue | null>(null);

/** Tracks which articles were already shown so the feed can avoid repeats. */
export function SeenProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<SeenEntry[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    void (async () => {
      const raw = await AsyncStorage.getItem(SEEN_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const now = Date.now();
          setEntries(
            (parsed as SeenEntry[]).filter(
              (e) => e && typeof e.id === "string" && now - e.ts < SEEN_TTL_MS,
            ),
          );
        }
      }
      loaded.current = true;
    })();
  }, []);

  const value = useMemo<SeenValue>(() => {
    const now = Date.now();
    const seenIds = entries.filter((e) => now - e.ts < SEEN_TTL_MS).map((e) => e.id);

    const markSeen = (ids: string[]) => {
      if (!ids.length) {
        return;
      }
      setEntries((prev) => {
        const ts = Date.now();
        const byId = new Map(prev.map((e) => [e.id, e]));
        for (const id of ids) {
          byId.set(id, { id, ts });
        }
        const next = [...byId.values()]
          .filter((e) => ts - e.ts < SEEN_TTL_MS)
          .slice(-SEEN_MAX);
        void AsyncStorage.setItem(SEEN_KEY, JSON.stringify(next));
        return next;
      });
    };

    return { seenIds, markSeen };
  }, [entries]);

  return <SeenContext.Provider value={value}>{children}</SeenContext.Provider>;
}

export function useSeen(): SeenValue {
  const ctx = useContext(SeenContext);
  if (!ctx) {
    throw new Error("useSeen must be used within a SeenProvider");
  }
  return ctx;
}
