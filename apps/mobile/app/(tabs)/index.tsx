import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import type { Article, FeedTab } from "@flowpedia/shared";
import { ArticleCard } from "../../src/components/ArticleCard";
import { SkeletonList } from "../../src/components/SkeletonCard";
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
    setRefreshing(true);
    seedRef.current = Math.floor(Math.random() * 1_000_000_000);
    await load(tab, false);
    setRefreshing(false);
  }, [load, tab]);

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

  return (
    <ScreenContainer style={{ paddingTop: insets.top }}>
      <View style={[styles.header, centeredColumn]}>
        <Text style={styles.brand}>Flowpedia</Text>
      </View>

      <View style={[styles.tabsRow, centeredColumn]}>
        {TABS.map(({ key, label }) => {
          const active = key === tab;
          return (
            <Pressable key={key} onPress={() => setTab(key)} style={styles.tabItem}>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t(label)}</Text>
              {active ? <View style={styles.tabUnderline} /> : null}
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{t("common.loadError")}</Text>
          <Pressable onPress={() => load(tab)} style={styles.retryBtn}>
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
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    header: { paddingHorizontal: spacing.screenPadding, paddingVertical: 12 },
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
