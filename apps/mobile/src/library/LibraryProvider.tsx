import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Article } from "@flowpedia/shared";
import { sendEvents } from "../api/client";

const LIKED_KEY = "flowpedia.liked";
const SAVED_KEY = "flowpedia.saved";

interface LibraryValue {
  isLiked: (id: string) => boolean;
  isSaved: (id: string) => boolean;
  toggleLike: (article: Article) => void;
  toggleSave: (article: Article) => void;
  /** Saved articles, most recent first. */
  saved: Article[];
}

const LibraryContext = createContext<LibraryValue | null>(null);

/** Drop the heavy fields before persisting a saved article. */
function compact(article: Article): Article {
  return { ...article, sections: [], links: [] };
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [saved, setSaved] = useState<Article[]>([]);

  useEffect(() => {
    void (async () => {
      const [liked, savedRaw] = await Promise.all([
        AsyncStorage.getItem(LIKED_KEY),
        AsyncStorage.getItem(SAVED_KEY),
      ]);
      if (liked) {
        setLikedIds(JSON.parse(liked) as string[]);
      }
      if (savedRaw) {
        setSaved(JSON.parse(savedRaw) as Article[]);
      }
    })();
  }, []);

  const value = useMemo<LibraryValue>(() => {
    const isLiked = (id: string) => likedIds.includes(id);
    const isSaved = (id: string) => saved.some((a) => a.id === id);

    const toggleLike = (article: Article) => {
      setLikedIds((prev) => {
        const next = prev.includes(article.id)
          ? prev.filter((id) => id !== article.id)
          : [article.id, ...prev];
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

    return { isLiked, isSaved, toggleLike, toggleSave, saved };
  }, [likedIds, saved]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error("useLibrary must be used within a LibraryProvider");
  }
  return ctx;
}
