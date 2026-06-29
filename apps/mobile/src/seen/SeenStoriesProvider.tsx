import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StoryGroup } from "@flowpedia/shared";

const KEY = "flowpedia.seenStories";
// Stories live 24h; keep "seen" marks a little longer so a re-open in the same
// window still reads as seen, and cap the set so it can't grow unbounded.
const TTL_MS = 3 * 24 * 60 * 60 * 1000;
const MAX = 1000;

interface SeenEntry {
  id: string;
  ts: number;
}

interface SeenStoriesValue {
  /** True once this story item (by its stable id) has been watched. A reshare
   *  gets a new id, so it reads as unseen again. */
  isStorySeen: (id: string) => boolean;
  /** Mark a story item as watched. */
  markStorySeen: (id: string) => void;
  /** True when the group has at least one not-yet-seen item (drives the ring). */
  hasUnseen: (group: StoryGroup) => boolean;
}

const SeenStoriesContext = createContext<SeenStoriesValue | null>(null);

/** Per-device memory of which stories were watched. Lets the bubbles show a
 *  colored ring only for unseen stories, sort unseen-first, and resume a viewer
 *  at the first unseen item. */
export function SeenStoriesProvider({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const loaded = useRef(false);

  useEffect(() => {
    void (async () => {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const now = Date.now();
          const fresh = (parsed as SeenEntry[]).filter(
            (e) => e && typeof e.id === "string" && now - e.ts < TTL_MS,
          );
          setSeen(new Set(fresh.map((e) => e.id)));
          entriesRef.current = fresh;
        }
      }
      loaded.current = true;
    })();
  }, []);

  // Keep the timestamped entries (for TTL/cap on persist) alongside the Set.
  const entriesRef = useRef<SeenEntry[]>([]);

  const value = useMemo<SeenStoriesValue>(() => {
    const isStorySeen = (id: string) => seen.has(id);

    const markStorySeen = (id: string) => {
      if (!id || seen.has(id)) {
        return;
      }
      const ts = Date.now();
      const next = [...entriesRef.current.filter((e) => e.id !== id), { id, ts }]
        .filter((e) => ts - e.ts < TTL_MS)
        .slice(-MAX);
      entriesRef.current = next;
      void AsyncStorage.setItem(KEY, JSON.stringify(next));
      setSeen(new Set(next.map((e) => e.id)));
    };

    const hasUnseen = (group: StoryGroup) => group.items.some((it) => !seen.has(it.id));

    return { isStorySeen, markStorySeen, hasUnseen };
  }, [seen]);

  return <SeenStoriesContext.Provider value={value}>{children}</SeenStoriesContext.Provider>;
}

export function useSeenStories(): SeenStoriesValue {
  const ctx = useContext(SeenStoriesContext);
  if (!ctx) {
    throw new Error("useSeenStories must be used within a SeenStoriesProvider");
  }
  return ctx;
}
