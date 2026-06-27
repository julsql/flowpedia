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
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { Article } from "@flowpedia/shared";
import { fetchFeed, sendEvents } from "../../src/api/client";
import { CONTENT_MAX_WIDTH } from "../../src/components/ScreenContainer";
import { RemoteImage } from "../../src/components/RemoteImage";
import { useLibrary } from "../../src/library/LibraryProvider";
import { useSeen } from "../../src/seen/SeenProvider";
import { useShare } from "../../src/share/ShareSheetProvider";
import { useTheme } from "../../src/theme";
import { useLocale } from "../../src/i18n";

// Backdrop colors for image-less items (title shown big, like a cover).
const COVER_COLORS = [
  "#8E6FB0",
  "#5A7DAF",
  "#4F9D8C",
  "#C18B5A",
  "#B0586E",
  "#6B7FA0",
  "#9A7B4F",
  "#7E8B5A",
];

function coverColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return COVER_COLORS[hash % COVER_COLORS.length];
}

export default function FlowScreen() {
  const { locale } = useLocale();
  const { colors } = useTheme();
  const { liked, saved, mutedInterests } = useLibrary();
  const { seenIds, markSeen } = useSeen();
  const [articles, setArticles] = useState<Article[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [height, setHeight] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const seedRef = useRef<number>(Math.floor(Math.random() * 1_000_000_000));
  // Ids already shown this session — so an article never appears twice.
  const shownIdsRef = useRef<Set<string>>(new Set());
  const atTopRef = useRef(true);
  const refreshingRef = useRef(false);
  const seedsRef = useRef<string[]>([]);
  seedsRef.current = useMemo(() => {
    const muted = new Set(mutedInterests);
    const ids = [...liked, ...saved]
      .filter((a) => !(a.category && muted.has(a.category)))
      .map((a) => a.id);
    return Array.from(new Set(ids)).slice(0, 6);
  }, [liked, saved, mutedInterests]);
  const excludeRef = useRef<string[]>([]);
  const seenIdsRef = useRef<string[]>([]);
  seenIdsRef.current = seenIds;
  const markSeenRef = useRef(markSeen);
  markSeenRef.current = markSeen;

  // Drop articles already shown this session (the discover feed can repeat past
  // its pool), so the user only ever sees new proposals.
  const dedupe = useCallback((items: Article[]) => {
    const fresh = items.filter((a) => !shownIdsRef.current.has(a.id));
    fresh.forEach((a) => shownIdsRef.current.add(a.id));
    return fresh;
  }, []);

  const load = useCallback(async () => {
    excludeRef.current = seenIdsRef.current;
    shownIdsRef.current = new Set();
    try {
      const res = await fetchFeed(
        "discover",
        locale,
        undefined,
        seedsRef.current,
        seedRef.current,
        excludeRef.current,
      );
      setArticles(dedupe(res.items));
      setCursor(res.nextCursor);
      markSeenRef.current(res.items.map((a) => a.id));
    } catch {
      // immersive view stays empty on failure
    }
  }, [locale, dedupe]);

  useEffect(() => {
    void load();
  }, [load]);

  // Pull up at the top → a brand-new flow (fresh shuffle seed).
  const refresh = useCallback(async () => {
    if (refreshingRef.current) {
      return;
    }
    refreshingRef.current = true;
    setRefreshing(true);
    seedRef.current = Math.floor(Math.random() * 1_000_000_000);
    await load();
    setRefreshing(false);
    refreshingRef.current = false;
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!cursor) {
      return;
    }
    try {
      const res = await fetchFeed(
        "discover",
        locale,
        cursor,
        seedsRef.current,
        seedRef.current,
        excludeRef.current,
      );
      setArticles((prev) => [...prev, ...dedupe(res.items)]);
      setCursor(res.nextCursor);
      markSeenRef.current(res.items.map((a) => a.id));
    } catch {
      // keep current items
    }
  }, [cursor, locale, dedupe]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    atTopRef.current = e.nativeEvent.contentOffset.y <= 1;
  }, []);

  // Web has no native pull-to-refresh: at the top, a wheel/touch pull-up starts a
  // new flow (cooldown avoids repeated reloads on one strong gesture).
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
      void refresh();
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
  }, [refresh]);

  const onLayout = (e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height);

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.immersiveBg },
        Platform.OS === "web" && styles.screenWeb,
      ]}
    >
      <View
        style={[styles.column, Platform.OS === "web" && styles.columnWeb]}
        onLayout={onLayout}
      >
        {height === 0 || articles.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlashList
            data={articles}
            keyExtractor={(item) => item.id}
            pagingEnabled
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => <FlowItem article={item} height={height} />}
            onScroll={onScroll}
            scrollEventThrottle={64}
            onEndReached={loadMore}
            onEndReachedThreshold={1}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
          />
        )}
      </View>
    </View>
  );
}

function FlowItem({ article, height }: { article: Article; height: number }) {
  const router = useRouter();
  const { t } = useLocale();
  const { colors } = useTheme();
  const { isLiked, isSaved, toggleLike, toggleSave } = useLibrary();
  const { openShare } = useShare();

  const open = () => {
    sendEvents([{ articleId: article.id, type: "openFull", ts: Date.now() }]);
    router.push({ pathname: "/article/[id]", params: { id: encodeURIComponent(article.id) } });
  };

  // Swipe left to open the article (without stealing the vertical paging or the
  // action-button taps: only claims clearly-horizontal leftward gestures).
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dx < -14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -45) {
          open();
        }
      },
    }),
  ).current;

  const liked = isLiked(article.id);
  const saved = isSaved(article.id);

  return (
    <View style={[styles.item, { height }]} {...pan.panHandlers}>
      {article.image ? (
        <RemoteImage source={{ uri: article.image }} style={styles.image} resizeMode="cover" />
      ) : (
        // No image → a colored cover with the title shown big.
        <View style={[styles.image, styles.cover, { backgroundColor: coverColor(article.id) }]}>
          <Text style={styles.coverTitle} numberOfLines={5}>
            {article.title}
          </Text>
        </View>
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.85)"]}
        style={styles.gradient}
        pointerEvents="none"
      />
      {/* Background tap layer (sits under the action buttons & text). */}
      <Pressable style={StyleSheet.absoluteFill} onPress={open} />

      {/* Swipe-to-read affordance: chevron on the right, vertically centered. */}
      <View style={styles.readHint} pointerEvents="none">
        <MaterialIcons name="chevron-left" size={36} color="rgba(255,255,255,0.92)" />
        <Text style={styles.readHintText}>{t("flow.swipeHint")}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => toggleLike(article)} hitSlop={8}>
          <MaterialIcons
            name={liked ? "favorite" : "favorite-border"}
            size={32}
            color={liked ? colors.like : "#fff"}
          />
        </Pressable>
        <Pressable style={styles.action} onPress={() => openShare(article)} hitSlop={8}>
          <MaterialIcons name="send" size={30} color="#fff" />
        </Pressable>
        <Pressable style={styles.action} onPress={() => toggleSave(article)} hitSlop={8}>
          <MaterialIcons
            name={saved ? "bookmark" : "bookmark-border"}
            size={32}
            color={saved ? colors.accent : "#fff"}
          />
        </Pressable>
      </View>

      <View style={styles.textBlock}>
        <Text style={styles.category}>{article.category.toUpperCase()}</Text>
        <Text style={styles.title}>{article.title}</Text>
        <Text style={styles.summary} numberOfLines={3}>
          {article.summary}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenWeb: { alignItems: "center" },
  column: { flex: 1, width: "100%" },
  columnWeb: { maxWidth: CONTENT_MAX_WIDTH },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  item: { width: "100%", justifyContent: "flex-end" },
  image: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  cover: { alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  coverTitle: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 40,
  },
  gradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: "60%" },
  actions: { position: "absolute", right: 14, bottom: 150, alignItems: "center", gap: 22 },
  action: { alignItems: "center" },
  textBlock: { paddingHorizontal: 18, paddingBottom: 40, paddingRight: 70 },
  category: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  title: { color: "#fff", fontSize: 26, fontWeight: "700", lineHeight: 31 },
  summary: { color: "rgba(255,255,255,0.9)", fontSize: 15, lineHeight: 22, marginTop: 10 },
  readHint: {
    position: "absolute",
    right: 6,
    top: 0,
    bottom: 0,
    width: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  readHintText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
});
