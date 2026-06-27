import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Article } from "@flowpedia/shared";
import { fetchFeed, fetchSearch } from "../../src/api/client";
import {
  CONTENT_MAX_WIDTH,
  ScreenContainer,
  centeredColumn,
} from "../../src/components/ScreenContainer";
import { RemoteImage } from "../../src/components/RemoteImage";
import { SkeletonCell } from "../../src/components/SkeletonCard";
import { radii, spacing, useTheme, type ThemeColors } from "../../src/theme";
import { useLocale } from "../../src/i18n";

// Instagram-style grid: 3 square tiles per row with hairline gaps.
const GRID_COLS = 3;
const GRID_GAP = 2;
// Backdrop colors for image-less tiles (so the title reads like a cover).
const TILE_COLORS = [
  "#8E6FB0",
  "#5A7DAF",
  "#4F9D8C",
  "#C18B5A",
  "#B0586E",
  "#6B7FA0",
  "#9A7B4F",
  "#7E8B5A",
];

function tileColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return TILE_COLORS[hash % TILE_COLORS.length];
}

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, locale } = useLocale();

  // Square tile size: 3 per row inside the centered column, minus the gaps.
  const { width: windowWidth } = useWindowDimensions();
  const tileSize = useMemo(() => {
    const columnWidth = Math.min(windowWidth, CONTENT_MAX_WIDTH) - 2 * spacing.screenPadding;
    return Math.floor((columnWidth - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS);
  }, [windowWidth]);

  // A search theme can be pushed from elsewhere (e.g. profile interest chips).
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(params.q ?? "");
  const [trending, setTrending] = useState<Article[]>([]);
  const [trendingCursor, setTrendingCursor] = useState<string | undefined>();
  const [results, setResults] = useState<Article[] | null>(null);
  const [searchCursor, setSearchCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const loadingMoreRef = useRef(false);
  // The query currently backing `results`, so paginated loads stay coherent.
  const activeQueryRef = useRef("");
  const seedRef = useRef<number>(Math.floor(Math.random() * 1_000_000_000));

  // Apply an incoming search theme (Explore tab may already be mounted).
  useEffect(() => {
    if (params.q) {
      setQuery(params.q);
    }
  }, [params.q]);

  useEffect(() => {
    void fetchFeed("popular", locale, undefined, [], seedRef.current)
      .then((res) => {
        setTrending(res.items);
        setTrendingCursor(res.nextCursor);
      })
      .catch(() => undefined);
  }, [locale]);

  // Debounced broad-theme search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      setSearchCursor(undefined);
      activeQueryRef.current = "";
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      void fetchSearch(q, locale)
        .then((res) => {
          activeQueryRef.current = q;
          setResults(res.items);
          setSearchCursor(res.nextCursor);
        })
        .catch(() => {
          setResults([]);
          setSearchCursor(undefined);
        })
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

  const loadMoreSearch = useCallback(async () => {
    if (!searchCursor || loadingMoreRef.current) {
      return;
    }
    loadingMoreRef.current = true;
    const q = activeQueryRef.current;
    try {
      const res = await fetchSearch(q, locale, searchCursor);
      // Ignore if the query changed while this request was in flight.
      if (activeQueryRef.current === q) {
        setResults((prev) => [...(prev ?? []), ...res.items]);
        setSearchCursor(res.nextCursor);
      }
    } catch {
      // keep current
    } finally {
      loadingMoreRef.current = false;
    }
  }, [searchCursor, locale]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 600) {
        if (results !== null) {
          void loadMoreSearch();
        } else {
          void loadMoreTrending();
        }
      }
    },
    [results, loadMoreSearch, loadMoreTrending],
  );

  // While a search is active, never fall back to trending — show skeletons until
  // the results arrive, then the grid.
  const searching = query.trim().length > 0;
  const showSkeletons = searching && (loading || results === null);
  const grid = searching ? (results ?? []) : trending;
  const hasMore = searching ? searchCursor : trendingCursor;

  const cellMargin = (i: number) => ({
    marginRight: i % GRID_COLS === GRID_COLS - 1 ? 0 : GRID_GAP,
    marginBottom: GRID_GAP,
    width: tileSize,
    height: tileSize,
  });

  return (
    <ScreenContainer style={{ paddingTop: insets.top + 12 }}>
      <View style={[centeredColumn, styles.searchBarWrap]}>
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
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, centeredColumn]}
        scrollEventThrottle={200}
        onScroll={onScroll}
      >
        {!searching ? (
          <View style={styles.trendingHeader}>
            <MaterialIcons name="trending-up" size={20} color={colors.accent} />
            <Text style={styles.trendingTitle}>{t("explore.trending")}</Text>
          </View>
        ) : null}

        {showSkeletons ? (
          <View style={styles.grid}>
            {Array.from({ length: 12 }).map((_, i) => (
              <SkeletonCell key={i} style={[styles.cell, cellMargin(i)]} />
            ))}
          </View>
        ) : grid.length === 0 ? (
          <Text style={styles.empty}>{t("explore.noResults")}</Text>
        ) : (
          <>
            <View style={styles.grid}>
              {grid.map((article, i) => (
                <Pressable
                  key={article.id}
                  style={[styles.cell, cellMargin(i)]}
                  onPress={() => open(article)}
                >
                  {article.image ? (
                    <>
                      <RemoteImage
                        source={{ uri: article.image }}
                        style={styles.cellImage}
                        resizeMode="cover"
                      />
                      <LinearGradient
                        colors={["transparent", "rgba(0,0,0,0.75)"]}
                        style={styles.cellGradient}
                        pointerEvents="none"
                      />
                      <Text style={styles.cellTitle} numberOfLines={3}>
                        {article.title}
                      </Text>
                    </>
                  ) : (
                    // No image → a colored backdrop with the title, like a cover.
                    <View style={[styles.cellImage, styles.cellFallback, { backgroundColor: tileColor(article.id) }]}>
                      <Text style={styles.cellFallbackText} numberOfLines={4}>
                        {article.title}
                      </Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
            {hasMore ? <ActivityIndicator color={colors.muted} style={styles.loader} /> : null}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    searchBarWrap: { paddingHorizontal: spacing.screenPadding },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
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
    grid: { flexDirection: "row", flexWrap: "wrap" },
    // Instagram-style square tile (sharp corners, hairline gaps via margins).
    cell: { overflow: "hidden", backgroundColor: colors.field, justifyContent: "flex-end" },
    cellImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
    // Title overlaid on the image (gradient for legibility).
    cellGradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: "60%" },
    cellTitle: { color: "#fff", fontSize: 12, fontWeight: "600", padding: 8, lineHeight: 15 },
    // Image-less tile: colored backdrop with the title centered, like a cover.
    cellFallback: { alignItems: "center", justifyContent: "center", padding: 8 },
    cellFallbackText: {
      color: "#fff",
      fontSize: 18,
      lineHeight: 22,
      fontWeight: "800",
      textAlign: "center",
    },
  });
