import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import type { Article, FeedTab } from "@flowpedia/shared";
import { ArticleCard } from "../../src/components/ArticleCard";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { fetchFeed } from "../../src/api/client";
import { useShare } from "../../src/share/ShareSheetProvider";
import { useLibrary } from "../../src/library/LibraryProvider";
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
  const { likedIds, saved } = useLibrary();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, locale } = useLocale();

  // Recommendation seeds for the "For you" tab (read via ref to avoid reloads
  // on unrelated tabs when the library changes).
  const seedsRef = useRef<string[]>([]);
  seedsRef.current = useMemo(
    () => Array.from(new Set([...likedIds, ...saved.map((a) => a.id)])).slice(0, 6),
    [likedIds, saved],
  );
  const seedsFor = (feedTab: FeedTab) => (feedTab === "forYou" ? seedsRef.current : []);

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
    async (nextTab: FeedTab) => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetchFeed(nextTab, locale, undefined, seedsFor(nextTab), seedRef.current);
        setArticles(res.items);
        setCursor(res.nextCursor);
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
    await load(tab);
    setRefreshing(false);
  }, [load, tab]);

  const loadMore = useCallback(async () => {
    if (!cursor || loading) {
      return;
    }
    try {
      const res = await fetchFeed(tab, locale, cursor, seedsFor(tab), seedRef.current);
      setArticles((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
    } catch {
      // keep the current list on pagination failure
    }
  }, [cursor, loading, tab, locale]);

  return (
    <ScreenContainer style={{ paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={styles.brand}>Flowpedia</Text>
      </View>

      <View style={styles.tabsRow}>
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
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlashList
          data={articles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ArticleCard article={item} onOpen={openArticle} onShare={openShare} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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
