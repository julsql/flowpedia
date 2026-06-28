import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const HISTORY_KEY = "flowpedia.searchHistory";
const MAX_ENTRIES = 50;

interface SearchHistoryValue {
  /** Past search queries, most recent first. */
  queries: string[];
  /** Record a query (deduped, moved to the front). */
  record: (query: string) => void;
  /** Remove a single past query. */
  remove: (query: string) => void;
  /** Wipe the whole search history (really deletes the stored data). */
  clear: () => void;
}

const SearchHistoryContext = createContext<SearchHistoryValue | null>(null);

export function SearchHistoryProvider({ children }: { children: ReactNode }) {
  const [queries, setQueries] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      if (!raw) {
        return;
      }
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setQueries(parsed.filter((x): x is string => typeof x === "string"));
        }
      } catch {
        // ignore corrupt history
      }
    })();
  }, []);

  const value = useMemo<SearchHistoryValue>(() => {
    const persist = (next: string[]) => {
      void AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    };
    return {
      queries,
      record: (query: string) => {
        const q = query.trim();
        if (!q) {
          return;
        }
        setQueries((prev) =>
          persist(
            [q, ...prev.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX_ENTRIES),
          ),
        );
      },
      remove: (query: string) => {
        setQueries((prev) => persist(prev.filter((x) => x !== query)));
      },
      clear: () => {
        setQueries([]);
        void AsyncStorage.removeItem(HISTORY_KEY);
      },
    };
  }, [queries]);

  return (
    <SearchHistoryContext.Provider value={value}>{children}</SearchHistoryContext.Provider>
  );
}

export function useSearchHistory(): SearchHistoryValue {
  const ctx = useContext(SearchHistoryContext);
  if (!ctx) {
    throw new Error("useSearchHistory must be used within a SearchHistoryProvider");
  }
  return ctx;
}
