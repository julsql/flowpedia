import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FontAwesome, MaterialIcons } from "@expo/vector-icons";
import type { Article, ArticleSection } from "@flowpedia/shared";
import { fetchArticle, sendEvents } from "../../src/api/client";
import { ScreenContainer, centeredColumn } from "../../src/components/ScreenContainer";
import { InfoCard } from "../../src/components/InfoCard";
import { RemoteImage } from "../../src/components/RemoteImage";
import { useLibrary } from "../../src/library/LibraryProvider";
import { useShare } from "../../src/share/ShareSheetProvider";
import { radii, spacing, useTheme, type ThemeColors } from "../../src/theme";
import { useLocale } from "../../src/i18n";

const SCROLL_OFFSET = 12;

export default function ArticleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, locale } = useLocale();
  const { isSaved, toggleSave, isLiked, toggleLike, markRead } = useLibrary();
  const { openShare } = useShare();
  const { id } = useLocalSearchParams<{ id: string }>();
  const articleId = decodeURIComponent(id ?? "");

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});
  // The chips strip scrolls to follow the active section as the reader advances.
  const chipsScrollRef = useRef<ScrollView>(null);
  const chipLayout = useRef<Record<string, { x: number; width: number }>>({});

  const openOriginal = useCallback(() => {
    if (article?.sourceUrl) {
      void Linking.openURL(article.sourceUrl);
    }
  }, [article]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await fetchArticle(articleId, locale);
      setArticle(data);
      setActiveSection(data.sections[0]?.id ?? null);
      markRead(data);
      sendEvents([{ articleId: data.id, type: "openFull", ts: Date.now() }]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [articleId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  // Log dwell time when leaving the article.
  useEffect(() => {
    const start = Date.now();
    return () => {
      sendEvents([{ articleId, type: "dwell", value: Date.now() - start, ts: Date.now() }]);
    };
  }, [articleId]);

  const openLink = useCallback(
    (targetId: string) => {
      sendEvents([{ articleId, type: "linkClick", ts: Date.now() }]);
      router.push({ pathname: "/article/[id]", params: { id: encodeURIComponent(targetId) } });
    },
    [articleId, router],
  );

  const jumpToSection = useCallback((sectionId: string) => {
    const y = sectionY.current[sectionId];
    if (y !== undefined) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - SCROLL_OFFSET), animated: true });
    }
    setActiveSection(sectionId);
  }, []);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y + SCROLL_OFFSET + 1;
      let current: string | null = article?.sections[0]?.id ?? null;
      for (const section of article?.sections ?? []) {
        const top = sectionY.current[section.id];
        if (top !== undefined && top <= y) {
          current = section.id;
        }
      }
      if (current !== activeSection) {
        setActiveSection(current);
      }
    },
    [article, activeSection],
  );

  // Keep the active chip in view as the active section changes.
  useEffect(() => {
    if (!activeSection) {
      return;
    }
    const pos = chipLayout.current[activeSection];
    if (pos) {
      chipsScrollRef.current?.scrollTo({ x: Math.max(0, pos.x - 16), animated: true });
    }
  }, [activeSection]);

  return (
    <ScreenContainer style={{ paddingTop: insets.top }}>
      <View style={[styles.header, centeredColumn]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable onPress={openOriginal} hitSlop={8} disabled={!article}>
            <FontAwesome name="wikipedia-w" size={19} color={colors.textPrimary} />
          </Pressable>
          <Pressable onPress={() => article && toggleLike(article)} hitSlop={8}>
            <MaterialIcons
              name={article && isLiked(article.id) ? "favorite" : "favorite-border"}
              size={24}
              color={article && isLiked(article.id) ? colors.like : colors.textPrimary}
            />
          </Pressable>
          <Pressable onPress={() => article && toggleSave(article)} hitSlop={8}>
            <MaterialIcons
              name={article && isSaved(article.id) ? "bookmark" : "bookmark-border"}
              size={24}
              color={article && isSaved(article.id) ? colors.accent : colors.textPrimary}
            />
          </Pressable>
          <Pressable onPress={() => article && openShare(article)} hitSlop={8}>
            <MaterialIcons name="send" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error || !article ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{t("common.loadError")}</Text>
          <Pressable onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {article.sections.length > 1 ? (
            <View style={[styles.chipsBar, centeredColumn]}>
              <ScrollView
                ref={chipsScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                {article.sections.map((section) => {
                  const active = section.id === activeSection;
                  return (
                    <Pressable
                      key={section.id}
                      onLayout={(e) => {
                        chipLayout.current[section.id] = {
                          x: e.nativeEvent.layout.x,
                          width: e.nativeEvent.layout.width,
                        };
                      }}
                      onPress={() => jumpToSection(section.id)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {section.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <ScrollView
            ref={scrollRef}
            scrollEventThrottle={16}
            onScroll={onScroll}
            contentContainerStyle={[styles.content, centeredColumn]}
          >
            <Text style={styles.category}>{article.category.toUpperCase()}</Text>
            <Text style={styles.title}>{article.title}</Text>

            <InfoCard article={article} colors={colors} />

            {article.sections.map((section, index) => (
              <SectionBlock
                key={section.id}
                section={section}
                showHeading={index > 0}
                styles={styles}
                onLayoutTop={(y) => {
                  sectionY.current[section.id] = y;
                }}
                onLinkPress={openLink}
              />
            ))}

            {article.links.length ? (
              <View style={styles.explore}>
                <Text style={styles.exploreTitle}>{t("article.keepExploring")}</Text>
                <View style={styles.exploreChips}>
                  {article.links.map((link) => (
                    <Pressable
                      key={link.targetId}
                      onPress={() => openLink(link.targetId)}
                      style={styles.exploreChip}
                    >
                      <Text style={styles.exploreChipText}>{link.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <Pressable onPress={openOriginal} style={styles.originalBtn}>
              <FontAwesome name="wikipedia-w" size={16} color={colors.accentLinkText} />
              <Text style={styles.originalBtnText}>{t("article.openOriginal")}</Text>
            </Pressable>
            <Text style={styles.source}>{t("common.source")}</Text>
          </ScrollView>
        </>
      )}
    </ScreenContainer>
  );
}

interface SectionBlockProps {
  section: ArticleSection;
  showHeading: boolean;
  styles: ReturnType<typeof makeStyles>;
  onLayoutTop: (y: number) => void;
  onLinkPress: (targetId: string) => void;
}

function SectionBlock({ section, showHeading, styles, onLayoutTop, onLinkPress }: SectionBlockProps) {
  const onLayout = (e: LayoutChangeEvent) => onLayoutTop(e.nativeEvent.layout.y);
  return (
    <View style={styles.section} onLayout={onLayout}>
      {showHeading ? <Text style={styles.sectionTitle}>{section.title}</Text> : null}
      {section.images?.map((img, i) => (
        <View key={`img-${i}`} style={styles.figure}>
          <RemoteImage
            source={{ uri: img.url }}
            style={[
              styles.figureImage,
              img.width && img.height ? { aspectRatio: img.width / img.height } : null,
            ]}
            resizeMode="cover"
          />
          {img.caption ? <Text style={styles.figureCaption}>{img.caption}</Text> : null}
        </View>
      ))}
      {section.paragraphs.map((paragraph, pIndex) => (
        <Text key={pIndex} style={styles.paragraph}>
          {paragraph.runs.map((run, rIndex) =>
            run.linkTargetId ? (
              <Text
                key={rIndex}
                style={styles.link}
                onPress={() => onLinkPress(run.linkTargetId as string)}
              >
                {run.text}
              </Text>
            ) : (
              <Text key={rIndex}>{run.text}</Text>
            ),
          )}
        </Text>
      ))}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 10,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { color: colors.textSecondary, fontSize: 15 },
  retryBtn: {
    backgroundColor: colors.field,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  retryText: { color: colors.accent, fontWeight: "600" },
  chipsBar: { borderBottomWidth: 1, borderBottomColor: colors.separator },
  chipsRow: { paddingHorizontal: spacing.screenPadding, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.field,
  },
  chipActive: { backgroundColor: colors.accent },
  chipText: { fontSize: 14, color: colors.textSecondary },
  chipTextActive: { color: colors.bg, fontWeight: "600" },
  content: { paddingHorizontal: spacing.screenPadding, paddingBottom: 48 },
  // Section illustrations.
  figure: { marginTop: 4, marginBottom: 14 },
  figureImage: {
    width: "100%",
    height: undefined,
    aspectRatio: 1.4,
    borderRadius: radii.media,
    backgroundColor: colors.field,
  },
  figureCaption: { color: colors.textTertiary, fontSize: 12, lineHeight: 17, marginTop: 6 },
  category: {
    color: colors.accentDark,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginTop: 16,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 25,
    fontWeight: "600",
    lineHeight: 30,
    marginTop: 6,
  },
  section: { marginTop: 20 },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: "600",
    marginBottom: 8,
  },
  paragraph: { color: colors.textSecondary, fontSize: 16, lineHeight: 26, marginBottom: 12 },
  link: {
    color: colors.accentLinkText,
    textDecorationLine: "underline",
    textDecorationColor: colors.accentLinkUnderline,
  },
  explore: { marginTop: 28 },
  exploreTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 12,
  },
  exploreChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  exploreChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.field,
  },
  exploreChipText: { color: colors.accentLinkText, fontSize: 14 },
  originalBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    marginTop: 28,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.field,
  },
  originalBtnText: { color: colors.accentLinkText, fontSize: 14, fontWeight: "600" },
  source: { color: colors.mutedLight, fontSize: 12, marginTop: 16 },
});
