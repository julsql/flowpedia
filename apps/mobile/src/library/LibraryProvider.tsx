import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Article, LibraryKind } from "@flowpedia/shared";
import {
  addLibraryItem,
  addLibraryItems,
  blockTopic,
  clearLibraryKind,
  fetchLibrary,
  fetchSummaries,
  prefetchArticle,
  removeLibraryItem,
  sendEvents,
} from "../api/client";
import { useRouter } from "expo-router";
import { useAuth } from "../auth/AuthProvider";
import { useLocale } from "../i18n";

const LIKED_KEY = "flowpedia.liked";
const SAVED_KEY = "flowpedia.saved";
const SHARED_KEY = "flowpedia.shared";
const READ_KEY = "flowpedia.read";
const MUTED_KEY = "flowpedia.mutedInterests";
const FOLDERS_KEY = "flowpedia.savedFolders";

interface LibraryValue {
  isLiked: (id: string) => boolean;
  isSaved: (id: string) => boolean;
  toggleLike: (article: Article) => void;
  toggleSave: (article: Article) => void;
  /** Save (or move) a bookmark into a folder; empty folder = unfiled. */
  saveToFolder: (article: Article, folder: string) => void;
  /** Current folder of a saved article, or undefined when unfiled. */
  savedFolderOf: (id: string) => string | undefined;
  /** Distinct bookmark folder names, most used first. */
  folders: string[];
  /** Record an article as shared (local history for the Shared tab). */
  recordShare: (article: Article) => void;
  /** Record an article as read (opened) — feeds the profile "Read" stat. */
  markRead: (article: Article) => void;
  /** Remove a single article from the reading history. */
  removeRead: (id: string) => void;
  /** Wipe the whole reading history (really deletes the stored data). */
  clearRead: () => void;
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

/** Persist a list and return it (for use inside a state updater). */
function persistList(key: string, list: Article[]): Article[] {
  void AsyncStorage.setItem(key, JSON.stringify(list));
  return list;
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
  const [savedFolders, setSavedFolders] = useState<Record<string, string>>({});
  const { locale } = useLocale();
  const auth = useAuth();
  const router = useRouter();

  // Pre-warm the offline cache with the full content of saved articles, so they
  // stay readable without network (liked articles are not pre-cached on purpose).
  useEffect(() => {
    for (const article of saved) {
      void prefetchArticle(article.id, locale);
    }
  }, [saved, locale]);

  useEffect(() => {
    void (async () => {
      const [likedRaw, savedRaw, sharedRaw, readRaw, mutedRaw, foldersRaw] = await Promise.all([
        AsyncStorage.getItem(LIKED_KEY),
        AsyncStorage.getItem(SAVED_KEY),
        AsyncStorage.getItem(SHARED_KEY),
        AsyncStorage.getItem(READ_KEY),
        AsyncStorage.getItem(MUTED_KEY),
        AsyncStorage.getItem(FOLDERS_KEY),
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
      if (foldersRaw) {
        const parsed = JSON.parse(foldersRaw) as unknown;
        if (parsed && typeof parsed === "object") {
          setSavedFolders(parsed as Record<string, string>);
        }
      }
    })();
  }, []);

  // On sign-in, reconcile the local (guest) library with the account's
  // server-side one: push local-only entries up, pull the account's entries
  // down, and union them. Best-effort — any failure leaves the local-first
  // library untouched. Guest mode never touches the server.
  useEffect(() => {
    if (!auth.user) {
      return;
    }
    let active = true;
    void (async () => {
      try {
        const snap = await fetchLibrary();
        if (!active) {
          return;
        }
        // Tolerate an older server that doesn't return `read` yet.
        const serverRead = snap.read ?? [];
        const localOnly = (arts: Article[], serverIds: string[], kind: LibraryKind) => {
          const known = new Set(serverIds);
          return arts.filter((a) => !known.has(a.id)).map((a) => ({ articleId: a.id, kind }));
        };
        // Local-only saves carry their folder so the account keeps the filing.
        const knownSaved = new Set(snap.saved);
        const localOnlySaves = saved
          .filter((a) => !knownSaved.has(a.id))
          .map((a) => ({ articleId: a.id, kind: "save" as const, folder: savedFolders[a.id] }));
        // Push every device-local entry the account doesn't have yet, in one call.
        void addLibraryItems([
          ...localOnly(liked, snap.liked, "like"),
          ...localOnlySaves,
          ...localOnly(shared, snap.shared, "share"),
          ...localOnly(read, serverRead, "read"),
        ]).catch(() => undefined);

        const byId = new Map<string, Article>();
        for (const a of [...liked, ...saved, ...shared, ...read]) {
          byId.set(a.id, a);
        }
        const wanted = [...new Set([...snap.liked, ...snap.saved, ...snap.shared, ...serverRead])];
        const missing = wanted.filter((id) => !byId.has(id));
        const hydrated = missing.length ? await fetchSummaries(missing, locale) : [];
        if (!active) {
          return;
        }
        for (const a of hydrated) {
          byId.set(a.id, compact(a));
        }
        const merge = (serverIds: string[], prev: Article[]) => {
          const fromServer = serverIds
            .map((id) => byId.get(id))
            .filter((a): a is Article => Boolean(a));
          const extra = prev.filter((a) => !serverIds.includes(a.id));
          return [...fromServer, ...extra];
        };
        setLiked((prev) => persistList(LIKED_KEY, merge(snap.liked, prev)));
        setSaved((prev) => persistList(SAVED_KEY, merge(snap.saved, prev)));
        setShared((prev) => persistList(SHARED_KEY, merge(snap.shared, prev)));
        // Reading history is capped like markRead does (most recent first).
        setRead((prev) => persistList(READ_KEY, merge(serverRead, prev).slice(0, 200)));
        // Merge the account's bookmark folders (local device wins on conflict).
        const serverFolders = snap.savedFolders ?? {};
        setSavedFolders((prev) => {
          const next = { ...serverFolders, ...prev };
          void AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(next));
          return next;
        });
      } catch {
        // Offline or unauthenticated — keep the local library as-is.
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id]);

  const value = useMemo<LibraryValue>(() => {
    const isLiked = (id: string) => liked.some((a) => a.id === id);
    const isSaved = (id: string) => saved.some((a) => a.id === id);
    const syncAdd = (articleId: string, kind: LibraryKind, folder?: string) => {
      if (auth.user) {
        void addLibraryItem(articleId, kind, folder).catch(() => undefined);
      }
    };
    const syncRemove = (articleId: string, kind: LibraryKind) => {
      if (auth.user) {
        void removeLibraryItem(articleId, kind).catch(() => undefined);
      }
    };

    // Liking, bookmarking and building a reading history require an account:
    // guests are invited to sign in instead of mutating a throwaway local
    // library. Returns true when the caller may proceed.
    const requireAccount = (): boolean => {
      if (auth.user) {
        return true;
      }
      if (auth.status === "guest") {
        router.push("/auth/login");
      }
      return false;
    };

    const toggleLike = (article: Article) => {
      if (!requireAccount()) {
        return;
      }
      const wasLiked = liked.some((a) => a.id === article.id);
      setLiked((prev) => {
        const next = prev.some((a) => a.id === article.id)
          ? prev.filter((a) => a.id !== article.id)
          : [compact(article), ...prev];
        void AsyncStorage.setItem(LIKED_KEY, JSON.stringify(next));
        return next;
      });
      // Unliking emits a revocation so the taste profile recomputes without it.
      sendEvents([{ articleId: article.id, type: wasLiked ? "remove" : "like", ts: Date.now() }]);
      if (wasLiked) {
        syncRemove(article.id, "like");
      } else {
        syncAdd(article.id, "like");
      }
    };

    const toggleSave = (article: Article) => {
      if (!requireAccount()) {
        return;
      }
      const wasSaved = saved.some((a) => a.id === article.id);
      setSaved((prev) => {
        const next = prev.some((a) => a.id === article.id)
          ? prev.filter((a) => a.id !== article.id)
          : [compact(article), ...prev];
        void AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next));
        return next;
      });
      // Un-bookmarking emits a revocation so the profile recomputes without it.
      sendEvents([{ articleId: article.id, type: wasSaved ? "remove" : "save", ts: Date.now() }]);
      if (wasSaved) {
        clearFolder(article.id);
        syncRemove(article.id, "save");
      } else {
        syncAdd(article.id, "save");
      }
    };

    /** Drop a bookmark's folder mapping (on unsave). */
    const clearFolder = (id: string) => {
      setSavedFolders((prev) => {
        if (!(id in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[id];
        void AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(next));
        return next;
      });
    };

    // Save (or move) a bookmark into a folder; empty folder = unfiled bucket.
    const saveToFolder = (article: Article, folder: string) => {
      if (!requireAccount()) {
        return;
      }
      const f = folder.trim();
      const wasSaved = saved.some((a) => a.id === article.id);
      setSaved((prev) =>
        prev.some((a) => a.id === article.id)
          ? prev
          : persistList(SAVED_KEY, [compact(article), ...prev]),
      );
      setSavedFolders((prev) => {
        const next = { ...prev };
        if (f) {
          next[article.id] = f;
        } else {
          delete next[article.id];
        }
        void AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(next));
        return next;
      });
      if (!wasSaved) {
        sendEvents([{ articleId: article.id, type: "save", ts: Date.now() }]);
      }
      syncAdd(article.id, "save", f || undefined); // upsert the folder server-side
    };

    const recordShare = (article: Article) => {
      setShared((prev) => {
        const next = [compact(article), ...prev.filter((a) => a.id !== article.id)];
        void AsyncStorage.setItem(SHARED_KEY, JSON.stringify(next));
        return next;
      });
      syncAdd(article.id, "share");
    };

    const markRead = (article: Article) => {
      // No reading history for guests (silently — opening articles must stay
      // frictionless; the invite to sign in only fires on like/bookmark).
      if (!auth.user) {
        return;
      }
      setRead((prev) => {
        // Move to the front on re-open so the list reads as a recency-ordered
        // history (most recently opened first). Capped so it can't grow forever.
        const next = [compact(article), ...prev.filter((a) => a.id !== article.id)].slice(0, 200);
        void AsyncStorage.setItem(READ_KEY, JSON.stringify(next));
        return next;
      });
      sendEvents([{ articleId: article.id, type: "read", ts: Date.now() }]);
      syncAdd(article.id, "read"); // persist history server-side (cross-device)
    };

    const removeRead = (id: string) => {
      setRead((prev) => {
        const next = prev.filter((a) => a.id !== id);
        void AsyncStorage.setItem(READ_KEY, JSON.stringify(next));
        return next;
      });
      // Revoke this article's history contribution from the taste profile.
      sendEvents([{ articleId: id, type: "remove", ts: Date.now() }]);
      syncRemove(id, "read");
    };

    const clearRead = () => {
      setRead([]);
      void AsyncStorage.removeItem(READ_KEY);
      // Wipe all reading-history contributions (library actions are kept).
      sendEvents([{ articleId: "*", type: "clearHistory", ts: Date.now() }]);
      if (auth.user) {
        void clearLibraryKind("read").catch(() => undefined);
      }
    };

    const muteInterest = (category: string) => {
      // Persist the block server-side too (cross-device "not interested").
      blockTopic(category);
      setMutedInterests((prev) => {
        if (prev.includes(category)) {
          return prev;
        }
        const next = [...prev, category];
        void AsyncStorage.setItem(MUTED_KEY, JSON.stringify(next));
        return next;
      });
    };

    // Distinct folders, most-used first (drives the picker + profile chips).
    const counts = new Map<string, number>();
    for (const f of Object.values(savedFolders)) {
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    const folders = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);

    return {
      isLiked,
      isSaved,
      toggleLike,
      toggleSave,
      saveToFolder,
      savedFolderOf: (id: string) => savedFolders[id],
      folders,
      recordShare,
      markRead,
      removeRead,
      clearRead,
      likedIds: liked.map((a) => a.id),
      liked,
      saved,
      shared,
      read,
      mutedInterests,
      muteInterest,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liked, saved, shared, read, mutedInterests, savedFolders, auth.user]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error("useLibrary must be used within a LibraryProvider");
  }
  return ctx;
}
