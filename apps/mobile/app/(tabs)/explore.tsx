import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Article } from "@flowpedia/shared";
import { fetchFeed, fetchSearch } from "../../src/api/client";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { radii, spacing, useTheme, type ThemeColors } from "../../src/theme";
import { useLocale } from "../../src/i18n";

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, locale } = useLocale();

  const [query, setQuery] = useState("");
  const [trending, setTrending] = useState<Article[]>([]);
  const [trendingCursor, setTrendingCursor] = useState<string | undefined>();
  const [results, setResults] = useState<Article[] | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingMoreRef = useRef(false);
  const seedRef = useRef<number>(Math.floor(Math.random() * 1_000_000_000));

  useEffect(() => {
    void fetchFeed("popular", locale, undefined, [], seedRef.current)
      .then((res) => {
        setTrending(res.items);
        setTrendingCursor(res.nextCursor);
      })
      .catch(() => undefined);
  }, [locale]);

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      void fetchSearch(q, locale)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [query, locale]);

  const open = useCallback(
    (article: Article) => {
      router.push({ pathname: "/article/[id]", params: { id: encodeURIComponent(article.id) } });
    },
    [router],
  );

  const loadMoreTrending = useCallback(async () => {
    if (!trendingCursor || loadingMoreRef.current) {
      return;
    }
    loadingMoreRef.current = true;
    try {
      const res = await fetchFeed("popular", locale, trendingCursor, [], seedRef.current);
      setTrending((prev) => [...prev, ...res.items]);
      setTrendingCursor(res.nextCursor);
    } catch {
      // keep current
    } finally {
      loadingMoreRef.current = false;
    }
  }, [trendingCursor, locale]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (results !== null) {
        return; // search results aren't paginated
      }
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 600) {
        void loadMoreTrending();
      }
    },
    [results, loadMoreTrending],
  );

  const showingResults = results !== null;
  const grid = showingResults ? results : trending;

  return (
    <ScreenContainer style={{ paddingTop: insets.top + 12 }}>
      <View style={styles.searchBar}>
        <MaterialIcons name="search" size={20} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("explore.searchPlaceholder")}
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <MaterialIcons name="close" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        scrollEventThrottle={200}
        onScroll={onScroll}
      >
        {!showingResults ? (
          <View style={styles.trendingHeader}>
            <MaterialIcons name="trending-up" size={20} color={colors.accent} />
            <Text style={styles.trendingTitle}>{t("explore.trending")}</Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : grid.length === 0 ? (
          <Text style={styles.empty}>{t("explore.noResults")}</Text>
        ) : (
          <>
            <View style={styles.grid}>
              {grid.map((article) => (
                <Pressable key={article.id} style={styles.cell} onPress={() => open(article)}>
                  {article.image ? (
                    <Image source={{ uri: article.image }} style={styles.cellImage} />
                  ) : (
                    <View style={[styles.cellImage, styles.cellPlaceholder]} />
                  )}
                  <LinearGradient
                    colors={["transparent", "rgba(0,0,0,0.8)"]}
                    style={styles.cellGradient}
                    pointerEvents="none"
                  />
                  <Text style={styles.cellTitle} numberOfLines={2}>
                    {article.title}
                  </Text>
                </Pressable>
              ))}
            </View>
            {!showingResults ? (
              <ActivityIndicator color={colors.muted} style={styles.loader} />
            ) : null}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: spacing.screenPadding,
      paddingHorizontal: 12,
      height: 44,
      borderRadius: radii.pill,
      backgroundColor: colors.field,
    },
    searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, height: "100%" },
    scroll: { paddingHorizontal: spacing.screenPadding, paddingTop: 18, paddingBottom: 24 },
    trendingHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
    trendingTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "600" },
    loader: { marginTop: 20, marginBottom: 12 },
    empty: { color: colors.textSecondary, fontSize: 15, marginTop: 40, textAlign: "center" },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
    cell: {
      width: "48%",
      height: 130,
      borderRadius: radii.media,
      overflow: "hidden",
      marginBottom: 12,
      justifyContent: "flex-end",
      backgroundColor: colors.field,
    },
    cellImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
    cellPlaceholder: { backgroundColor: colors.separatorThick },
    cellGradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: "70%" },
    cellTitle: { color: "#fff", fontSize: 14, fontWeight: "600", padding: 10 },
  });
