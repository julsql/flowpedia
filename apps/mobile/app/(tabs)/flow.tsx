import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { useLibrary } from "../../src/library/LibraryProvider";
import { useShare } from "../../src/share/ShareSheetProvider";
import { colors } from "../../src/theme";
import { useLocale } from "../../src/i18n";

export default function FlowScreen() {
  const { locale } = useLocale();
  const [articles, setArticles] = useState<Article[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [height, setHeight] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetchFeed("popular", locale);
      setArticles(res.items);
      setCursor(res.nextCursor);
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
      const res = await fetchFeed("popular", locale, cursor);
      setArticles((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
    } catch {
      // keep current items
    }
  }, [cursor, locale]);

  const onLayout = (e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height);

  return (
    <View style={styles.screen} onLayout={onLayout}>
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
  );
}

function FlowItem({ article, height }: { article: Article; height: number }) {
  const router = useRouter();
  const { t } = useLocale();
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
        <Image source={{ uri: article.image }} style={styles.image} resizeMode="cover" />
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
  screen: { flex: 1, backgroundColor: colors.immersiveBg },
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
