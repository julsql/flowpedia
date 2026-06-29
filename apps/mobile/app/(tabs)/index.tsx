import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import type { Article, FeedTab } from "@flowpedia/shared";
import { ArticleCard } from "../../src/components/ArticleCard";
import { SkeletonList } from "../../src/components/SkeletonCard";
import { StoriesBar } from "../../src/components/StoriesBar";
import { NotificationBell } from "../../src/components/NotificationBell";
import { ScreenContainer, centeredColumn } from "../../src/components/ScreenContainer";
import { fetchFeed } from "../../src/api/client";
import { useShare } from "../../src/share/ShareSheetProvider";
import { useLibrary } from "../../src/library/LibraryProvider";
import { useSeen } from "../../src/seen/SeenProvider";
import { spacing, typography, useTheme, type ThemeColors } from "../../src/theme";
import { useLocale, type TranslationKey } from "../../src/i18n";

const TABS: { key: FeedTab; label: TranslationKey }[] = [
  { key: "forYou", label: "feed.forYou" },
  { key: "popular", label: "feed.popular" },
  { key: "news", label: "feed.news" },
];

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { openShare } = useShare();
  const { liked, saved, mutedInterests } = useLibrary();
  const { seenIds, markSeen } = useSeen();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, locale } = useLocale();

  // Recommendation seeds for the "For you" tab — liked/saved articles, minus
  // any whose category the user muted (steers the algorithm away from it). Read
  // via ref to avoid reloads on unrelated tabs when the library changes.
  const seedsRef = useRef<string[]>([]);
  seedsRef.current = useMemo(() => {
    const muted = new Set(mutedInterests);
    const ids = [...liked, ...saved]
      .filter((a) => !(a.category && muted.has(a.category)))
      .map((a) => a.id);
    return Array.from(new Set(ids)).slice(0, 6);
  }, [liked, saved, mutedInterests]);
  const seedsFor = (feedTab: FeedTab) => (feedTab === "forYou" ? seedsRef.current : []);

  // Snapshot of recently-seen ids, frozen per load so pagination stays stable.
  const excludeRef = useRef<string[]>([]);
  // Read seen state via refs so marking items seen never re-triggers load().
  const seenIdsRef = useRef<string[]>([]);
  seenIdsRef.current = seenIds;
  const markSeenRef = useRef(markSeen);
  markSeenRef.current = markSeen;

  const openArticle = useCallback(
    (article: Article) => {
      router.push({ pathname: "/article/[id]", params: { id: encodeURIComponent(article.id) } });
    },
    [router],
  );

  const [tab, setTab] = useState<FeedTab>("forYou");
  const [articles, setArticles] = useState<Article[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  // New shuffle seed per session → reloads bring fresh content.
  const seedRef = useRef<number>(Math.floor(Math.random() * 1_000_000_000));
  // Whether the list is scrolled to the very top (gates web pull-to-refresh).
  const atTopRef = useRef(true);
  const refreshingRef = useRef(false);

  const load = useCallback(
    async (nextTab: FeedTab, clear = true) => {
      setLoading(true);
      setError(false);
      // Drop stale items immediately so a tab switch shows skeletons, never the
      // previous tab's articles. Pull-to-refresh keeps them (RefreshControl spins).
      if (clear) {
        setArticles([]);
        setCursor(undefined);
      }
      // Freeze the seen-snapshot for this load so paging doesn't shift as new
      // items get marked seen.
      excludeRef.current = seenIdsRef.current;
      try {
        const res = await fetchFeed(
          nextTab,
          locale,
          undefined,
          seedsFor(nextTab),
          seedRef.current,
          excludeRef.current,
        );
        setArticles(res.items);
        setCursor(res.nextCursor);
        markSeenRef.current(res.items.map((a) => a.id));
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [locale],
  );

  useEffect(() => {
    void load(tab);
  }, [load, tab]);

  const onRefresh = useCallback(async () => {
    if (refreshingRef.current) {
      return;
    }
    refreshingRef.current = true;
    setRefreshing(true);
    seedRef.current = Math.floor(Math.random() * 1_000_000_000);
    await load(tab, false);
    setRefreshing(false);
    refreshingRef.current = false;
  }, [load, tab]);

  // Web has no native pull-to-refresh (RefreshControl is a no-op): when the list
  // is at the top and the user pulls up — with a mouse wheel/trackpad OR a touch
  // drag (web on a phone) — reload with fresh proposals. A cooldown avoids
  // firing several reloads in a row on one strong gesture.
  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    const COOLDOWN_MS = 1500;
    let acc = 0;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    let touchStartY: number | null = null;
    let cooldownUntil = 0;

    const trigger = () => {
      const now = Date.now();
      if (refreshingRef.current || now < cooldownUntil) {
        return;
      }
      cooldownUntil = now + COOLDOWN_MS;
      acc = 0;
      void onRefresh();
    };

    const onWheel = (e: WheelEvent) => {
      if (!atTopRef.current || e.deltaY >= 0) {
        acc = 0;
        return;
      }
      acc += -e.deltaY;
      if (resetTimer) {
        clearTimeout(resetTimer);
      }
      resetTimer = setTimeout(() => {
        acc = 0;
      }, 300);
      if (acc > 260) {
        trigger();
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = atTopRef.current ? e.touches[0]?.clientY ?? null : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchStartY === null || !atTopRef.current) {
        return;
      }
      // Finger dragging down while at the top = pull-to-refresh.
      if ((e.touches[0]?.clientY ?? 0) - touchStartY > 90) {
        trigger();
        touchStartY = null;
      }
    };
    const onTouchEnd = () => {
      touchStartY = null;
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      if (resetTimer) {
        clearTimeout(resetTimer);
      }
    };
  }, [onRefresh]);

  const onListScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    atTopRef.current = e.nativeEvent.contentOffset.y <= 1;
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursor || loading) {
      return;
    }
    try {
      const res = await fetchFeed(
        tab,
        locale,
        cursor,
        seedsFor(tab),
        seedRef.current,
        excludeRef.current,
      );
      setArticles((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
      markSeenRef.current(res.items.map((a) => a.id));
    } catch {
      // keep the current list on pagination failure
    }
  }, [cursor, loading, tab, locale]);

  // Horizontal swipe across the feed moves between tabs (For you ↔ Popular ↔
  // News). Kept in a ref so the responder reads the live tab without rebuilding.
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const swipeToTab = useCallback((direction: 1 | -1) => {
    const index = TABS.findIndex((entry) => entry.key === tabRef.current);
    const next = index + direction;
    if (next >= 0 && next < TABS.length) {
      setTab(TABS[next].key);
    }
  }, []);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Only claim clearly-horizontal gestures, so vertical scroll and
        // pull-to-refresh keep working untouched.
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_e, g) => {
          if (g.dx <= -56) {
            swipeToTab(1); // swipe left → next tab
          } else if (g.dx >= 56) {
            swipeToTab(-1); // swipe right → previous tab
          }
        },
      }),
    [swipeToTab],
  );

  return (
    <ScreenContainer style={{ paddingTop: insets.top }}>
      <View style={[styles.header, centeredColumn]}>
        <Text style={styles.brand}>Flowpedia</Text>
        <NotificationBell />
      </View>

      <View style={[styles.tabsRow, centeredColumn]}>
        {TABS.map(({ key, label }) => {
          const active = key === tab;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={styles.tabItem}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t(label)}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t(label)}</Text>
              {active ? <View style={styles.tabUnderline} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={centeredColumn}>
        <StoriesBar />
      </View>

      <View style={styles.feedArea} {...panResponder.panHandlers}>
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{t("common.loadError")}</Text>
          <Pressable
            onPress={() => load(tab)}
            style={styles.retryBtn}
            accessibilityRole="button"
            accessibilityLabel={t("common.retry")}
          >
            <Text style={styles.retryText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      ) : loading && articles.length === 0 ? (
        <View style={centeredColumn}>
          <SkeletonList count={3} />
        </View>
      ) : (
        <FlashList
          data={articles}
          keyExtractor={(item) => item.id}
          onScroll={onListScroll}
          scrollEventThrottle={32}
          ListHeaderComponent={
            refreshing && Platform.OS === "web" ? (
              <View style={[centeredColumn, styles.webRefresh]}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={centeredColumn}>
              <ArticleCard article={item} onOpen={openArticle} onShare={openShare} />
            </View>
          )}
          ItemSeparatorComponent={() => (
            <View style={centeredColumn}>
              <View style={styles.separator} />
            </View>
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        />
      )}
      </View>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    feedArea: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.screenPadding,
      paddingVertical: 6,
    },
    brand: {
      fontFamily: typography.brandFamily,
      fontSize: typography.brandSize,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    tabsRow: {
      flexDirection: "row",
      gap: 20,
      paddingHorizontal: spacing.screenPadding,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    tabItem: { paddingBottom: 10 },
    tabLabel: { fontSize: 15, fontWeight: "500", color: colors.muted },
    tabLabelActive: { color: colors.textPrimary, fontWeight: "600" },
    tabUnderline: {
      height: 2,
      backgroundColor: colors.accent,
      borderRadius: 2,
      marginTop: 8,
    },
    separator: { height: spacing.cardGap, backgroundColor: colors.separatorThick },
    webRefresh: { paddingVertical: 14 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    errorText: { color: colors.textSecondary, fontSize: 15 },
    retryBtn: {
      backgroundColor: colors.field,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 999,
    },
    retryText: { color: colors.accent, fontWeight: "600" },
  });
