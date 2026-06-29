import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { StoryGroup } from "@flowpedia/shared";
import { RemoteImage } from "../../src/components/RemoteImage";
import { colorForText } from "../../src/components/LetterThumb";
import { CONTENT_MAX_WIDTH } from "../../src/components/ScreenContainer";
import { fetchStories, fetchUserStories } from "../../src/api/client";
import { useSeenStories } from "../../src/seen/SeenStoriesProvider";
import { sortStoryGroups } from "../../src/stories/order";
import { useLocale } from "../../src/i18n";
import { useTheme, type ThemeColors } from "../../src/theme";

// How long each story is shown before auto-advancing (Instagram ≈ 5s).
const STORY_DURATION_MS = 6000;

// Oldest first → newest last (Instagram order); the newest are the unseen ones.
function sortItems(group: StoryGroup) {
  return [...group.items].sort(
    (a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0),
  );
}

export default function StoryViewerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { isStorySeen, markStorySeen, hasUnseen } = useSeenStories();
  const params = useLocalSearchParams<{ username?: string }>();
  const username = String(params.username ?? "");

  // The ordered queue of people to traverse, starting at the tapped user and
  // continuing in bubble order — finishing one person rolls to the next.
  const [queue, setQueue] = useState<StoryGroup[]>([]);
  const [gi, setGi] = useState(0); // person index in the queue
  const [index, setIndex] = useState(0); // story index within that person
  const [loading, setLoading] = useState(true);
  const started = useRef(false);
  const progress = useRef(new Animated.Value(0)).current;

  // Read seen-state at open time so the queue/order doesn't reshuffle while you
  // watch (watching marks stories seen, which would otherwise re-sort).
  const hasUnseenRef = useRef(hasUnseen);
  hasUnseenRef.current = hasUnseen;

  const group = queue[gi] ?? null;
  const items = useMemo(() => (group ? sortItems(group) : []), [group]);
  const current = items[index];

  // Where to start a person: their first unseen story, or the very start when
  // everything was already watched (a re-open replays from the beginning).
  const entryIndex = useCallback(
    (g: StoryGroup) => {
      const its = sortItems(g);
      const firstUnseen = its.findIndex((it) => !isStorySeen(it.id));
      return firstUnseen === -1 ? 0 : firstUnseen;
    },
    [isStorySeen],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    started.current = false;
    void (async () => {
      let q: StoryGroup[] = [];
      try {
        // Same order as the bubbles: chain forward from the tapped user.
        const feed = sortStoryGroups(await fetchStories(), hasUnseenRef.current);
        const start = feed.findIndex((g) => g.user.username === username);
        if (start >= 0) q = feed.slice(start);
      } catch {
        // ignore — fall back to the single-user fetch below
      }
      if (!q.length) {
        // Tapped from a profile of someone not in your feed (public account):
        // just their stories, no chaining.
        try {
          const single = await fetchUserStories(username);
          if (single) q = [single];
        } catch {
          // ignore
        }
      }
      if (!active) return;
      setQueue(q);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [username]);

  // Enter the first person once the queue is loaded.
  useEffect(() => {
    if (started.current || !queue.length) return;
    started.current = true;
    setGi(0);
    setIndex(entryIndex(queue[0]));
  }, [queue, entryIndex]);

  // Mark the story on screen as watched.
  useEffect(() => {
    if (current) markStorySeen(current.id);
  }, [current?.id, current, markStorySeen]);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  const goNext = useCallback(() => {
    if (index < items.length - 1) {
      setIndex(index + 1);
      return;
    }
    // End of this person. Roll to the next person only while there's still new
    // content; once the new stories run out, close.
    const nextGi = gi + 1;
    if (nextGi < queue.length && hasUnseenRef.current(queue[nextGi])) {
      setGi(nextGi);
      setIndex(entryIndex(queue[nextGi]));
    } else {
      close();
    }
  }, [index, items.length, gi, queue, entryIndex, close]);

  const goPrev = useCallback(() => {
    if (index > 0) {
      setIndex(index - 1);
      return;
    }
    // Back past the first story → the previous person's last story.
    if (gi > 0) {
      const prevItems = sortItems(queue[gi - 1]);
      setGi(gi - 1);
      setIndex(Math.max(0, prevItems.length - 1));
    }
  }, [index, gi, queue]);

  // Animate the current segment, auto-advance when it fills.
  useEffect(() => {
    if (!items.length) return;
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION_MS,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) goNext();
    });
    return () => anim.stop();
  }, [gi, index, items.length, goNext, progress]);

  const openArticle = () => {
    if (current) {
      router.push({
        pathname: "/article/[id]",
        params: { id: encodeURIComponent(current.articleId) },
      });
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.column}>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 80 }} />
        ) : !current ? (
          <View style={styles.emptyBox}>
            <Text style={styles.empty}>{t("story.empty")}</Text>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t("a11y.closeStories")}>
              <Text style={styles.closeText}>{t("a11y.closeStories")}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {current.image ? (
              <RemoteImage source={{ uri: current.image }} style={StyleSheet.absoluteFill} noBackdrop />
            ) : (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  styles.coloredBg,
                  { backgroundColor: colorForText(current.title ?? current.articleId) },
                ]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Text style={styles.bgTitle} numberOfLines={6}>
                  {current.title ?? current.articleId}
                </Text>
              </View>
            )}
            {/* Legibility scrims top & bottom. */}
            <LinearGradient
              colors={["rgba(0,0,0,0.55)", "transparent", "rgba(0,0,0,0.8)"]}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFill}
            />

            {/* Tap zones: left third = previous, right two-thirds = next. */}
            <Pressable
              style={styles.tapPrev}
              onPress={goPrev}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.previousStory")}
            />
            <Pressable
              style={styles.tapNext}
              onPress={goNext}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.nextStory")}
            />

            {/* Progress segments + header */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
              <View style={styles.segments}>
                {items.map((it, i) => (
                  <View key={it.id} style={styles.segmentTrack}>
                    <Animated.View
                      style={[
                        styles.segmentFill,
                        i < index
                          ? { width: "100%" }
                          : i === index
                            ? {
                                width: progress.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: ["0%", "100%"],
                                }),
                              }
                            : { width: "0%" },
                      ]}
                    />
                  </View>
                ))}
              </View>
              <View style={styles.headerRow}>
                <Text style={styles.author} numberOfLines={1}>
                  {group?.user.displayName ?? `@${username}`}
                </Text>
                <Pressable
                  onPress={close}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={t("a11y.closeStories")}
                >
                  <MaterialIcons name="close" size={26} color="#fff" />
                </Pressable>
              </View>
            </View>

            {/* Title + read CTA (above the tap zones) */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]} pointerEvents="box-none">
              <Text style={styles.title} numberOfLines={3}>
                {current.title ?? current.articleId}
              </Text>
              <Pressable
                style={styles.readBtn}
                onPress={openArticle}
                accessibilityRole="button"
                accessibilityLabel={t("a11y.openStoryArticle", {
                  title: current.title ?? current.articleId,
                })}
              >
                <Text style={styles.readLabel}>{t("story.readArticle")}</Text>
                <MaterialIcons name="arrow-forward" size={18} color={colors.onAccent} />
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // Sides use the app background (like every other screen); the story itself
    // lives in a centered black band capped at the feed width, so on web it never
    // spans wider than the rest of the app.
    root: { flex: 1, backgroundColor: colors.bg, alignItems: "center" },
    column: {
      flex: 1,
      width: "100%",
      maxWidth: CONTENT_MAX_WIDTH,
      marginHorizontal: "auto",
      overflow: "hidden",
      backgroundColor: "#000",
    },
    // No-image story: fill with a color derived from the title, with the title
    // faded large in the background (the readable copy still sits in the footer).
    coloredBg: { alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
    bgTitle: {
      color: "rgba(255,255,255,0.18)",
      fontSize: 44,
      fontWeight: "900",
      textAlign: "center",
      lineHeight: 50,
    },
    emptyBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
    empty: { color: "#bbb", fontSize: 15 },
    closeText: { color: colors.accent, fontSize: 15, fontWeight: "700" },
    tapPrev: { position: "absolute", left: 0, top: 0, bottom: 0, width: "33%" },
    tapNext: { position: "absolute", right: 0, top: 0, bottom: 0, width: "67%" },
    header: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: 10 },
    segments: { flexDirection: "row", gap: 4 },
    segmentTrack: {
      flex: 1,
      height: 3,
      borderRadius: 2,
      backgroundColor: "rgba(255,255,255,0.35)",
      overflow: "hidden",
    },
    segmentFill: { height: 3, backgroundColor: "#fff" },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 12,
    },
    author: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "700" },
    footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, gap: 14 },
    title: { color: "#fff", fontSize: 22, fontWeight: "800", lineHeight: 28 },
    readBtn: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 6,
      backgroundColor: colors.accent,
      borderRadius: 999,
      paddingVertical: 10,
      paddingHorizontal: 18,
      minHeight: 44,
    },
    readLabel: { color: colors.onAccent, fontSize: 15, fontWeight: "800" },
  });
}
