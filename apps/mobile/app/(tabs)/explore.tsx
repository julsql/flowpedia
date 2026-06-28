import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
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
import { useSearchHistory } from "../../src/search/SearchHistoryProvider";

// Instagram-style grid: 3 square tiles per row with hairline gaps.
const GRID_COLS = 3;
const GRID_GAP = 2;
// Keep loading pages until the grid is tall enough to scroll (then onScroll pages on).
const GRID_FILL_TARGET = 24;
// How many recent searches to show (up to 50 are kept in storage).
const RECENT_SEARCHES_SHOWN = 12;
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
  // `input` is what the field shows (updates on every keystroke); `query` is the
  // debounced term that actually drives the search — decoupling the two keeps
  // typing responsive (the heavy grid no longer re-renders per keystroke, so
  // fast typing never drops characters) and only fires after a typing pause.
  const [input, setInput] = useState(params.q ?? "");
  const [query, setQuery] = useState(params.q ?? "");
  const { queries: searchHistory, record: recordSearch, remove: removeSearch, clear: clearSearch } =
    useSearchHistory();
  const recordSearchRef = useRef(recordSearch);
  recordSearchRef.current = recordSearch;
  const [trending, setTrending] = useState<Article[]>([]);
  const [trendingCursor, setTrendingCursor] = useState<string | undefined>();
  const [results, setResults] = useState<Article[] | null>(null);
  const [searchCursor, setSearchCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const atTopRef = useRef(true);
  const loadingMoreRef = useRef(false);
  // The query currently backing `results`, so paginated loads stay coherent.
  const activeQueryRef = useRef("");
  const seedRef = useRef<number>(Math.floor(Math.random() * 1_000_000_000));
  // Typo handling returned by the API ("did you mean" / auto-correction).
  const [searchInfo, setSearchInfo] = useState<{
    correctedQuery?: string;
    originalQuery?: string;
    suggestion?: string;
  }>({});
  // When true, search the literal query (skip auto-correction).
  const [exact, setExact] = useState(false);
  const exactRef = useRef(false);
  exactRef.current = exact;

  // Typing a new query always re-enables auto-correction.
  const changeQuery = useCallback((text: string) => {
    setInput(text);
    setExact(false);
    if (!text.trim()) {
      setQuery("");
    } else {
      setLoading(true);
    }
  }, []);

  // Debounce: wait for a pause in typing before searching, and restart the timer
  // on each edit.
  useEffect(() => {
    const q = input.trim();
    if (!q) {
      return;
    }
    const handle = setTimeout(() => setQuery(input.trim()), 450);
    return () => clearTimeout(handle);
  }, [input]);

  // Apply an incoming search theme (Explore tab may already be mounted).
  useEffect(() => {
    if (params.q) {
      setInput(params.q);
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

  // Run the (already debounced) broad-theme search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      setSearchCursor(undefined);
      setSearchInfo({});
      activeQueryRef.current = "";
      return;
    }
    setLoading(true);
    let cancelled = false;
    void fetchSearch(q, locale, undefined, exact)
      .then((res) => {
        if (cancelled) {
          return;
        }
        activeQueryRef.current = q;
        setResults(res.items);
        setSearchCursor(res.nextCursor);
        setSearchInfo({
          correctedQuery: res.correctedQuery,
          originalQuery: res.originalQuery,
          suggestion: res.suggestion,
        });
        // Remember a query that actually returned something (recent searches).
        if (res.items.length) {
          recordSearchRef.current(res.correctedQuery ?? q);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResults([]);
          setSearchCursor(undefined);
          setSearchInfo({});
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [query, locale, exact]);

  const open = useCallback(
    (article: Article) => {
      router.push({ pathname: "/article/[id]", params: { id: encodeURIComponent(article.id) } });
    },
    [router],
  );

  // Replay a past search from the history list.
  const runSearch = useCallback((q: string) => {
    setInput(q);
    setQuery(q);
    setExact(false);
  }, []);

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
      const res = await fetchSearch(q, locale, searchCursor, exactRef.current);
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

  // A feed page (5 items) doesn't fill the 3-column grid, so the ScrollView
  // isn't scrollable and `onScroll` never fires to page further. Auto-load until
  // there are enough tiles to scroll — then onScroll keeps the feed infinite.
  useEffect(() => {
    if (loadingMoreRef.current) {
      return;
    }
    const isSearching = query.trim().length > 0;
    if (isSearching) {
      if (searchCursor && (results?.length ?? 0) > 0 && (results?.length ?? 0) < GRID_FILL_TARGET) {
        void loadMoreSearch();
      }
    } else if (trendingCursor && trending.length > 0 && trending.length < GRID_FILL_TARGET) {
      void loadMoreTrending();
    }
  }, [
    query,
    trending.length,
    trendingCursor,
    results,
    searchCursor,
    loadMoreTrending,
    loadMoreSearch,
  ]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      atTopRef.current = contentOffset.y <= 1;
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

  // Pull up at the top of the trending grid → fresh proposals (new shuffle seed).
  const refreshTrending = useCallback(async () => {
    if (refreshingRef.current || query.trim().length > 0) {
      return;
    }
    refreshingRef.current = true;
    setRefreshing(true);
    seedRef.current = Math.floor(Math.random() * 1_000_000_000);
    try {
      const res = await fetchFeed("popular", locale, undefined, [], seedRef.current);
      setTrending(res.items);
      setTrendingCursor(res.nextCursor);
    } catch {
      // keep current
    } finally {
      setRefreshing(false);
      refreshingRef.current = false;
    }
  }, [locale, query]);

  // Web has no native pull-to-refresh: when at the top, a wheel/touch pull-up
  // reloads fresh trending (with a cooldown to avoid repeated reloads).
  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    let acc = 0;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    let touchStartY: number | null = null;
    let cooldownUntil = 0;
    const trigger = () => {
      const now = Date.now();
      if (refreshingRef.current || now < cooldownUntil) {
        return;
      }
      cooldownUntil = now + 1500;
      acc = 0;
      void refreshTrending();
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
  }, [refreshTrending]);

  // UI is in "search mode" as soon as the user types (input), so we never flash
  // trending during the debounce window. Show skeletons until results arrive.
  const searching = input.trim().length > 0;
  const showSkeletons = searching && (loading || results === null);
  const grid = searching ? (results ?? []) : trending;
  const hasMore = searching ? searchCursor : trendingCursor;
  const showHistory = !searching && searchHistory.length > 0;

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
            value={input}
            onChangeText={changeQuery}
            placeholder={t("explore.searchPlaceholder")}
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t("a11y.search")}
          />
          {query ? (
            <Pressable
              onPress={() => changeQuery("")}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.clearSearch")}
            >
              <MaterialIcons name="close" size={20} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, centeredColumn]}
        scrollEventThrottle={64}
        onScroll={onScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshTrending}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {refreshing && Platform.OS === "web" ? (
          <ActivityIndicator color={colors.accent} style={styles.webRefresh} />
        ) : null}

        {showHistory ? (
          <View style={styles.history}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>{t("explore.recentSearches")}</Text>
              <Pressable
                onPress={clearSearch}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t("common.clearAll")}
              >
                <Text style={styles.historyClear}>{t("common.clearAll")}</Text>
              </Pressable>
            </View>
            <View style={styles.historyChips}>
              {searchHistory.slice(0, RECENT_SEARCHES_SHOWN).map((q) => (
                <View key={q} style={styles.historyChip}>
                  <Pressable
                    onPress={() => runSearch(q)}
                    hitSlop={10}
                    style={styles.historyChipLabel}
                    accessibilityRole="button"
                    accessibilityLabel={q}
                  >
                    <MaterialIcons name="history" size={15} color={colors.muted} />
                    <Text style={styles.historyChipText} numberOfLines={1}>
                      {q}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removeSearch(q)}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={t("a11y.removeSearch", { query: q })}
                  >
                    <MaterialIcons name="close" size={15} color={colors.muted} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {!searching ? (
          <View style={styles.trendingHeader}>
            <MaterialIcons name="trending-up" size={20} color={colors.accent} />
            <Text style={styles.trendingTitle}>{t("explore.trending")}</Text>
          </View>
        ) : null}

        {searching && searchInfo.correctedQuery ? (
          <View style={styles.correction}>
            <Text style={styles.correctionText}>
              {t("explore.resultsFor", { query: searchInfo.correctedQuery })}
            </Text>
            <Pressable onPress={() => setExact(true)} hitSlop={6}>
              <Text style={styles.correctionLink}>
                {t("explore.searchInstead", { query: searchInfo.originalQuery ?? "" })}
              </Text>
            </Pressable>
          </View>
        ) : searching && searchInfo.suggestion ? (
          <Pressable
            style={styles.correction}
            onPress={() => runSearch(searchInfo.suggestion as string)}
            hitSlop={6}
          >
            <Text style={styles.correctionLink}>
              {t("explore.didYouMean", { query: searchInfo.suggestion })}
            </Text>
          </Pressable>
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
                  accessibilityRole="button"
                  accessibilityLabel={t("a11y.openArticle", { title: article.title })}
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
                    // No image → a colored backdrop with the title shown big, and
                    // the same bottom title overlay as image tiles (uniform look).
                    <>
                      <View style={[styles.cellImage, styles.cellFallback, { backgroundColor: tileColor(article.id) }]}>
                        <Text style={styles.cellFallbackText} numberOfLines={4}>
                          {article.title}
                        </Text>
                      </View>
                      <LinearGradient
                        colors={["transparent", "rgba(0,0,0,0.75)"]}
                        style={styles.cellGradient}
                        pointerEvents="none"
                      />
                      <Text style={styles.cellTitle} numberOfLines={3}>
                        {article.title}
                      </Text>
                    </>
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
    webRefresh: { marginBottom: 12 },
    // Recent searches.
    history: { marginBottom: 22 },
    historyHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    historyTitle: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    historyClear: { color: colors.accentLinkText, fontSize: 13, fontWeight: "600" },
    historyChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    historyChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radii.pill,
      backgroundColor: colors.field,
      maxWidth: "100%",
    },
    historyChipLabel: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
    historyChipText: { color: colors.textSecondary, fontSize: 14 },
    trendingHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
    // "Did you mean / results for" search-correction banner.
    correction: { marginBottom: 14, gap: 2 },
    correctionText: { color: colors.textSecondary, fontSize: 14 },
    correctionLink: { color: colors.accentLinkText, fontSize: 14, fontWeight: "600" },
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
