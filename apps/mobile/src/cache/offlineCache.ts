import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Article, FeedResponse, FeedTab } from "@flowpedia/shared";
import type { Locale } from "../i18n";

// Client-side offline cache (AsyncStorage). The API has its own server cache;
// this one lets the app re-open already-seen articles and show a frozen feed
// when the network drops. Articles are stored one-per-key with a separate LRU
// index, so we never rewrite a multi-MB blob and never hit per-row size limits.

const INDEX_KEY = "flowpedia.offline.articles.index";
const ARTICLE_PREFIX = "flowpedia.offline.article.";
const FEED_PREFIX = "flowpedia.offline.feed.";
const MAX_ARTICLES = 40;

const articleKey = (id: string, locale: Locale) => `${locale}::${id}`;
const articleStoreKey = (key: string) => `${ARTICLE_PREFIX}${key}`;
const feedStoreKey = (tab: FeedTab, locale: Locale) => `${FEED_PREFIX}${tab}::${locale}`;

// Serialize index mutations so concurrent caches don't clobber each other.
let writeChain: Promise<void> = Promise.resolve();
function serialize(task: () => Promise<void>): Promise<void> {
  writeChain = writeChain.then(task, task);
  return writeChain;
}

async function readIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Store a full article and mark it most-recent in the LRU, evicting the tail. */
export function cacheArticle(article: Article, locale: Locale): Promise<void> {
  const key = articleKey(article.id, locale);
  return serialize(async () => {
    try {
      await AsyncStorage.setItem(articleStoreKey(key), JSON.stringify(article));
      const index = (await readIndex()).filter((k) => k !== key);
      index.unshift(key);
      const evicted = index.splice(MAX_ARTICLES);
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
      if (evicted.length) {
        await AsyncStorage.multiRemove(evicted.map(articleStoreKey));
      }
    } catch {
      // Best-effort cache; never break the caller.
    }
  });
}

/** Read a cached full article, or null if it was never cached / was evicted. */
export async function getCachedArticle(id: string, locale: Locale): Promise<Article | null> {
  try {
    const raw = await AsyncStorage.getItem(articleStoreKey(articleKey(id, locale)));
    return raw ? (JSON.parse(raw) as Article) : null;
  } catch {
    return null;
  }
}

/** Persist the first feed page so it can be replayed offline (frozen feed). */
export async function cacheFeedPage(
  tab: FeedTab,
  locale: Locale,
  response: FeedResponse,
): Promise<void> {
  try {
    await AsyncStorage.setItem(feedStoreKey(tab, locale), JSON.stringify(response));
  } catch {
    // Best-effort.
  }
}

/** Read the frozen feed page for a tab, or null if none was cached. */
export async function getCachedFeedPage(
  tab: FeedTab,
  locale: Locale,
): Promise<FeedResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(feedStoreKey(tab, locale));
    return raw ? (JSON.parse(raw) as FeedResponse) : null;
  } catch {
    return null;
  }
}
