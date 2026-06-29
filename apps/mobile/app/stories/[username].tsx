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
import { fetchUserStories } from "../../src/api/client";
import { useSeenStories } from "../../src/seen/SeenStoriesProvider";
import { useLocale } from "../../src/i18n";
import { useTheme, type ThemeColors } from "../../src/theme";

// How long each story is shown before auto-advancing (Instagram ≈ 5s).
const STORY_DURATION_MS = 6000;

export default function StoryViewerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { isStorySeen, markStorySeen } = useSeenStories();
  const params = useLocalSearchParams<{ username?: string }>();
  const username = String(params.username ?? "");

  const [group, setGroup] = useState<StoryGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const started = useRef(false);
  const progress = useRef(new Animated.Value(0)).current;

  // Oldest first → newest last (Instagram order); the newest are the unseen ones
  // you resume at.
  const items = useMemo(
    () =>
      [...(group?.items ?? [])].sort(
        (a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0),
      ),
    [group],
  );

  useEffect(() => {
    let active = true;
    fetchUserStories(username)
      .then((g) => {
        if (!active) return;
        setGroup(g);
        setLoading(false);
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [username]);

  // Once loaded, resume at the first unseen story (fall back to the start when
  // everything was already watched).
  useEffect(() => {
    if (started.current || !items.length) return;
    started.current = true;
    const firstUnseen = items.findIndex((it) => !isStorySeen(it.id));
    setIndex(firstUnseen === -1 ? 0 : firstUnseen);
  }, [items, isStorySeen]);

  // Mark the story on screen as watched.
  useEffect(() => {
    const it = items[index];
    if (it) markStorySeen(it.id);
  }, [index, items, markStorySeen]);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i < items.length - 1) return i + 1;
      close();
      return i;
    });
  }, [items.length, close]);

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

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
  }, [index, items.length, goNext, progress]);

  const openArticle = () => {
    const item = items[index];
    if (item) {
      router.push({
        pathname: "/article/[id]",
        params: { id: encodeURIComponent(item.articleId) },
      });
    }
  };

  const current = items[index];

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
