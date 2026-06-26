import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Article } from "@flowpedia/shared";
import { sendEvents } from "../api/client";

const LIKED_KEY = "flowpedia.liked";
const SAVED_KEY = "flowpedia.saved";
const SHARED_KEY = "flowpedia.shared";
const READ_KEY = "flowpedia.read";

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

  useEffect(() => {
    void (async () => {
      const [likedRaw, savedRaw, sharedRaw, readRaw] = await Promise.all([
        AsyncStorage.getItem(LIKED_KEY),
        AsyncStorage.getItem(SAVED_KEY),
        AsyncStorage.getItem(SHARED_KEY),
        AsyncStorage.getItem(READ_KEY),
      ]);
      setLiked(parseArticles(likedRaw));
      setSaved(parseArticles(savedRaw));
      setShared(parseArticles(sharedRaw));
      setRead(parseArticles(readRaw));
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
    };
  }, [liked, saved, shared, read]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error("useLibrary must be used within a LibraryProvider");
  }
  return ctx;
}
