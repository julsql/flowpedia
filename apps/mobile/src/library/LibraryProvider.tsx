import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Article } from "@flowpedia/shared";
import { prefetchArticle, sendEvents } from "../api/client";
import { useLocale } from "../i18n";

const LIKED_KEY = "flowpedia.liked";
const SAVED_KEY = "flowpedia.saved";
const SHARED_KEY = "flowpedia.shared";
const READ_KEY = "flowpedia.read";
const MUTED_KEY = "flowpedia.mutedInterests";

interface LibraryValue {
  isLiked: (id: string) => boolean;
  isSaved: (id: string) => boolean;
  toggleLike: (article: Article) => void;
  toggleSave: (article: Article) => void;
  /** Record an article as shared (local history for the Shared tab). */
  recordShare: (article: Article) => void;
  /** Record an article as read (opened) — feeds the profile "Read" stat. */
  markRead: (article: Article) => void;
  /** Liked article ids, most recent first (recommendation seeds). */
  likedIds: string[];
  liked: Article[];
  saved: Article[];
  shared: Article[];
  read: Article[];
  /** Interest categories the user muted to steer the algorithm away from them. */
  mutedInterests: string[];
  muteInterest: (category: string) => void;
}

const LibraryContext = createContext<LibraryValue | null>(null);

/** Drop heavy fields before persisting. */
function compact(article: Article): Article {
  return { ...article, sections: [], links: [] };
}

/** Parse a persisted Article[] list, tolerating the old string[] format. */
function parseArticles(raw: string | null): Article[] {
  if (!raw) {
    return [];
  }
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed) && parsed.every((item) => typeof item === "object" && item !== null)) {
    return parsed as Article[];
  }
  return [];
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [liked, setLiked] = useState<Article[]>([]);
  const [saved, setSaved] = useState<Article[]>([]);
  const [shared, setShared] = useState<Article[]>([]);
  const [read, setRead] = useState<Article[]>([]);
  const [mutedInterests, setMutedInterests] = useState<string[]>([]);
  const { locale } = useLocale();

  // Pre-warm the offline cache with the full content of saved articles, so they
  // stay readable without network (liked articles are not pre-cached on purpose).
  useEffect(() => {
    for (const article of saved) {
      void prefetchArticle(article.id, locale);
    }
  }, [saved, locale]);

  useEffect(() => {
    void (async () => {
      const [likedRaw, savedRaw, sharedRaw, readRaw, mutedRaw] = await Promise.all([
        AsyncStorage.getItem(LIKED_KEY),
        AsyncStorage.getItem(SAVED_KEY),
        AsyncStorage.getItem(SHARED_KEY),
        AsyncStorage.getItem(READ_KEY),
        AsyncStorage.getItem(MUTED_KEY),
      ]);
      setLiked(parseArticles(likedRaw));
      setSaved(parseArticles(savedRaw));
      setShared(parseArticles(sharedRaw));
      setRead(parseArticles(readRaw));
      if (mutedRaw) {
        const parsed = JSON.parse(mutedRaw) as unknown;
        if (Array.isArray(parsed)) {
          setMutedInterests(parsed.filter((x): x is string => typeof x === "string"));
        }
      }
    })();
  }, []);

  const value = useMemo<LibraryValue>(() => {
    const isLiked = (id: string) => liked.some((a) => a.id === id);
    const isSaved = (id: string) => saved.some((a) => a.id === id);

    const toggleLike = (article: Article) => {
      setLiked((prev) => {
        const next = prev.some((a) => a.id === article.id)
          ? prev.filter((a) => a.id !== article.id)
          : [compact(article), ...prev];
        void AsyncStorage.setItem(LIKED_KEY, JSON.stringify(next));
        return next;
      });
      sendEvents([{ articleId: article.id, type: "like", ts: Date.now() }]);
    };

    const toggleSave = (article: Article) => {
      setSaved((prev) => {
        const next = prev.some((a) => a.id === article.id)
          ? prev.filter((a) => a.id !== article.id)
          : [compact(article), ...prev];
        void AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next));
        return next;
      });
      sendEvents([{ articleId: article.id, type: "save", ts: Date.now() }]);
    };

    const recordShare = (article: Article) => {
      setShared((prev) => {
        const next = [compact(article), ...prev.filter((a) => a.id !== article.id)];
        void AsyncStorage.setItem(SHARED_KEY, JSON.stringify(next));
        return next;
      });
    };

    const markRead = (article: Article) => {
      setRead((prev) => {
        if (prev.some((a) => a.id === article.id)) {
          return prev;
        }
        const next = [compact(article), ...prev];
        void AsyncStorage.setItem(READ_KEY, JSON.stringify(next));
        return next;
      });
    };

    const muteInterest = (category: string) => {
      setMutedInterests((prev) => {
        if (prev.includes(category)) {
          return prev;
        }
        const next = [...prev, category];
        void AsyncStorage.setItem(MUTED_KEY, JSON.stringify(next));
        return next;
      });
    };

    return {
      isLiked,
      isSaved,
      toggleLike,
      toggleSave,
      recordShare,
      markRead,
      likedIds: liked.map((a) => a.id),
      liked,
      saved,
      shared,
      read,
      mutedInterests,
      muteInterest,
    };
  }, [liked, saved, shared, read, mutedInterests]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error("useLibrary must be used within a LibraryProvider");
  }
  return ctx;
}
