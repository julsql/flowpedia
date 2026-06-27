import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
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

export default function FlowScreen() {
  const { locale } = useLocale();
  const { colors } = useTheme();
  const { liked, saved, mutedInterests } = useLibrary();
  const { seenIds, markSeen } = useSeen();
  const [articles, setArticles] = useState<Article[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [height, setHeight] = useState(0);

  const seedRef = useRef<number>(Math.floor(Math.random() * 1_000_000_000));
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

  const load = useCallback(async () => {
    excludeRef.current = seenIdsRef.current;
    try {
      const res = await fetchFeed(
        "discover",
        locale,
        undefined,
        seedsRef.current,
        seedRef.current,
        excludeRef.current,
      );
      setArticles(res.items);
      setCursor(res.nextCursor);
      markSeenRef.current(res.items.map((a) => a.id));
    } catch {
      // immersive view stays empty on failure
    }
  }, [locale]);

  useEffect(() => {
    void load();
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
      setArticles((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
      markSeenRef.current(res.items.map((a) => a.id));
    } catch {
      // keep current items
    }
  }, [cursor, locale]);

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
            onEndReached={loadMore}
            onEndReachedThreshold={1}
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

  const liked = isLiked(article.id);
  const saved = isSaved(article.id);

  return (
    <Pressable style={[styles.item, { height }]} onPress={open}>
      {article.image ? (
        <RemoteImage source={{ uri: article.image }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]} />
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.85)"]}
        style={styles.gradient}
        pointerEvents="none"
      />

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
        <View style={styles.hintRow}>
          <MaterialIcons name="keyboard-arrow-up" size={20} color="rgba(255,255,255,0.85)" />
          <Text style={styles.hint}>{t("flow.swipeHint")}</Text>
        </View>
      </View>
    </Pressable>
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
  imagePlaceholder: { backgroundColor: "#1a1a1a" },
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
  hintRow: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  hint: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "500" },
});
