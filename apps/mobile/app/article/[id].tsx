import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  PanResponder,
  Platform,
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { FontAwesome, MaterialIcons } from "@expo/vector-icons";
import type { Article, ArticleSection } from "@flowpedia/shared";
import {
  fetchArticle,
  fetchFeed,
  fetchSummaries,
  largeImageUrl,
  sendEvents,
} from "../../src/api/client";
import { ScreenContainer, centeredColumn } from "../../src/components/ScreenContainer";
import { Ancestry } from "../../src/components/Ancestry";
import { ArticleCard } from "../../src/components/ArticleCard";
import { InfoCard } from "../../src/components/InfoCard";
import { PieChartCard } from "../../src/components/PieChart";
import { RemoteImage } from "../../src/components/RemoteImage";
import { useLibrary } from "../../src/library/LibraryProvider";
import { useShare } from "../../src/share/ShareSheetProvider";
import { useArticleSpeech } from "../../src/speech/useArticleSpeech";
import { radii, spacing, useTheme, type ThemeColors } from "../../src/theme";
import { useLocale } from "../../src/i18n";
import { CONTENT_MAX_WIDTH } from "../../src/components/ScreenContainer";

const SCROLL_OFFSET = 12;
const TOC_WIDTH = 220;
const TOC_GAP = 24;
// The "scroll to top" button appears past this scroll distance.
const SCROLL_TOP_THRESHOLD = 700;
// Height of the slide-in title sub-header.
const SUBHEADER_HEIGHT = 40;
// A section becomes "active" when its heading reaches this fraction down the
// viewport — the upper-reading zone, not the very top edge.
const ACTIVE_SECTION_LINE = 0.3;

// The article body is a virtualized list of blocks, so even very long pages
// (every section, full tables, the whole ancestry…) render without mounting
// everything at once — no parsing caps needed for performance.
type ArticleBlock =
  | { type: "head" }
  | { type: "section"; section: ArticleSection; index: number }
  | { type: "ancestry" }
  | { type: "exploreHeader" }
  | { type: "related"; article: Article }
  | { type: "exploreChips" }
  | { type: "wikiAlone" }
  | { type: "source" };

export default function ArticleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, locale } = useLocale();
  const { isSaved, toggleSave, isLiked, toggleLike, markRead } = useLibrary();
  const { openShare } = useShare();
  // "Keep exploring" — an infinite feed of related articles (related-to-this +
  // popular), so the reader keeps bouncing instead of hitting a dead end.
  const [related, setRelated] = useState<Article[]>([]);
  const [relatedCursor, setRelatedCursor] = useState<string | undefined>();
  const relatedSeed = useRef<number>(Math.floor(Math.random() * 1_000_000_000));
  // Feed seeds for "keep exploring": the article + its "Articles connexes" links.
  const relatedSeedsRef = useRef<string[]>([]);
  // Ids already in the related feed, so pages never duplicate an article.
  const relatedShownRef = useRef<Set<string>>(new Set());
  const loadingRelatedRef = useRef(false);
  const { id } = useLocalSearchParams<{ id: string }>();
  const articleId = decodeURIComponent(id ?? "");

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Read the article aloud with the device's native TTS (no model/network).
  const {
    available: speechAvailable,
    speaking,
    paused,
    currentSectionId,
    toggle: toggleSpeech,
    stop: stopSpeech,
    readFromSection,
  } = useArticleSpeech(article, locale);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  // Tapped section image shown full-size in a lightbox (with its caption).
  const [lightbox, setLightbox] = useState<{
    url: string;
    caption?: string;
    marker?: { top: number; left: number; ratio: number };
  } | null>(null);
  // A slim secondary header carrying the page title slides in below the summary
  // bar when the reader scrolls up (mid-page), and retracts when scrolling down.
  const subHeaderAnim = useRef(new Animated.Value(0)).current;
  const subShownRef = useRef(false);
  const lastYRef = useRef(0);
  // After tapping a summary chip, briefly freeze active-section detection so the
  // programmatic scroll doesn't immediately re-select a neighbour.
  const jumpLockRef = useRef(0);
  // Sections the reader has collapsed (by section id) — heading stays, body hides.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);
  // In-page search ("find on page").
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);

  // On a wide web window the table of contents sits in a fixed sidebar on the
  // right (easier to use); on mobile / narrow web it stays a horizontal bar.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const tocAsSidebar =
    Platform.OS === "web" && windowWidth >= CONTENT_MAX_WIDTH + 2 * (TOC_WIDTH + TOC_GAP);
  const tocRightOffset = (windowWidth - CONTENT_MAX_WIDTH) / 2 - TOC_WIDTH - TOC_GAP;
  // Usable width of the centered content column (for stretching narrow tables).
  const contentWidth = Math.min(windowWidth, CONTENT_MAX_WIDTH) - 2 * spacing.screenPadding;

  const listRef = useRef<FlashListRef<ArticleBlock>>(null);
  // sectionId → block index, for jump-to-section / find-scroll (kept in a ref so
  // the scroll callbacks always read the latest mapping).
  const sectionBlockIndexRef = useRef<Map<string, number>>(new Map());
  // The chips strip scrolls to follow the active section as the reader advances.
  const chipsScrollRef = useRef<ScrollView>(null);
  const chipLayout = useRef<Record<string, { x: number; width: number }>>({});

  const openOriginal = useCallback(() => {
    if (article?.sourceUrl) {
      // Log the "view on Wikipedia" tap: frequently-opened pages flag likely
      // parsing gaps (the reader wasn't enough, so the user went to the source).
      sendEvents([{ articleId: article.id, type: "openWikipedia", ts: Date.now() }]);
      void Linking.openURL(article.sourceUrl);
    }
  }, [article]);

  // Go back, but fall back to the home feed when there's no history (e.g. after a
  // web reload, where the back stack is empty).
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  }, [router]);

  // Jump straight back to the home feed — escape a deep chain of bounced links
  // without tapping "back" many times. Clears the article stack when possible.
  const goHome = useCallback(() => {
    if (router.canDismiss()) {
      router.dismissAll();
    } else {
      router.replace("/(tabs)");
    }
  }, [router]);

  // Swipe right anywhere on the page → go back (the gesture only engages on a
  // clearly horizontal rightward move, so vertical scrolling is unaffected).
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          g.dx > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
        onPanResponderRelease: (_, g) => {
          if (g.dx > 60) {
            goBack();
          }
        },
      }),
    [goBack],
  );

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
      // Namespaced targets (e.g. "Catégorie:…") aren't articles — open them on
      // Wikipedia instead of trying to render them.
      if (targetId.includes(":")) {
        void Linking.openURL(
          `https://${locale}.wikipedia.org/wiki/${encodeURIComponent(targetId)}`,
        );
        return;
      }
      sendEvents([{ articleId, type: "linkClick", ts: Date.now() }]);
      router.push({ pathname: "/article/[id]", params: { id: encodeURIComponent(targetId) } });
    },
    [articleId, router, locale],
  );

  // Load the bottom "keep exploring" feed once the article is known: the page's
  // own "Articles connexes" pages (as cards) first, then algorithmic proposals
  // seeded by them — all de-duplicated.
  useEffect(() => {
    if (!article) {
      return;
    }
    let cancelled = false;
    setRelated([]);
    setRelatedCursor(undefined);
    relatedSeed.current = Math.floor(Math.random() * 1_000_000_000);
    const linkIds = article.links.map((l) => l.targetId).filter((id) => !id.includes(":"));
    relatedSeedsRef.current = [articleId, ...linkIds].slice(0, 6);
    relatedShownRef.current = new Set([articleId]);

    void Promise.all([
      fetchSummaries(linkIds.slice(0, 8), locale).catch(() => []),
      fetchFeed("forYou", locale, undefined, relatedSeedsRef.current, relatedSeed.current, [
        articleId,
      ]).catch(() => ({ items: [], nextCursor: undefined })),
    ]).then(([connexes, feed]) => {
      if (cancelled) {
        return;
      }
      const list: Article[] = [];
      for (const a of [...connexes, ...feed.items]) {
        if (relatedShownRef.current.has(a.id)) {
          continue;
        }
        relatedShownRef.current.add(a.id);
        list.push(a);
      }
      setRelated(list);
      setRelatedCursor(feed.nextCursor);
    });
    return () => {
      cancelled = true;
    };
  }, [article, articleId, locale]);

  const loadMoreRelated = useCallback(async () => {
    if (!relatedCursor || loadingRelatedRef.current) {
      return;
    }
    loadingRelatedRef.current = true;
    try {
      const res = await fetchFeed(
        "forYou",
        locale,
        relatedCursor,
        relatedSeedsRef.current,
        relatedSeed.current,
        [articleId],
      );
      const fresh = res.items.filter((a) => !relatedShownRef.current.has(a.id));
      fresh.forEach((a) => relatedShownRef.current.add(a.id));
      setRelated((prev) => [...prev, ...fresh]);
      setRelatedCursor(res.nextCursor);
    } catch {
      // keep current list on pagination failure
    } finally {
      loadingRelatedRef.current = false;
    }
  }, [relatedCursor, locale, articleId]);

  const jumpToSection = useCallback((sectionId: string) => {
    const idx = sectionBlockIndexRef.current.get(sectionId);
    if (idx !== undefined) {
      listRef.current?.scrollToIndex({ index: idx, viewOffset: SCROLL_OFFSET, animated: true });
    }
    jumpLockRef.current = Date.now() + 650;
    setActiveSection(sectionId);
  }, []);

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const setSubHeader = useCallback(
    (show: boolean) => {
      if (subShownRef.current === show) {
        return;
      }
      subShownRef.current = show;
      Animated.timing(subHeaderAnim, {
        toValue: show ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    },
    [subHeaderAnim],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = e.nativeEvent.contentOffset.y;
      setShowScrollTop(offsetY > SCROLL_TOP_THRESHOLD);
      // Slide the title sub-header in on scroll-up (mid-page), out on scroll-down
      // or near the top (where the on-page title is already visible).
      const dy = offsetY - lastYRef.current;
      lastYRef.current = offsetY;
      if (offsetY < 90) {
        setSubHeader(false);
      } else if (dy < -6) {
        setSubHeader(true);
      } else if (dy > 6) {
        setSubHeader(false);
      }
    },
    [setSubHeader],
  );

  // Active-section detection via the virtualized list's viewability: the topmost
  // visible section is the one being read. Frozen briefly after a chip tap.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { index: number | null; item: ArticleBlock }[] }) => {
      if (Date.now() < jumpLockRef.current) {
        return;
      }
      let top: { index: number | null; item: ArticleBlock } | null = null;
      for (const v of viewableItems) {
        if (v.item?.type === "section" && (top === null || (v.index ?? 0) < (top.index ?? 0))) {
          top = v;
        }
      }
      if (top && top.item.type === "section") {
        setActiveSection(top.item.section.id);
      }
    },
  ).current;

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

  // Table of contents = top-level sections only (h2). Sub-sections (h3) are
  // nested under their parent and shown only in the web sidebar.
  const sections = article?.sections ?? [];
  const topSections = useMemo(() => sections.filter((s) => (s.level ?? 2) <= 2), [sections]);
  const tocTree = useMemo(() => {
    const tree: { section: ArticleSection; children: ArticleSection[] }[] = [];
    for (const s of sections) {
      if ((s.level ?? 2) <= 2) {
        tree.push({ section: s, children: [] });
      } else if (tree.length) {
        tree[tree.length - 1].children.push(s);
      }
    }
    return tree;
  }, [sections]);
  // The top-level section that contains the active (possibly sub-) section.
  const activeTopId = useMemo(() => {
    if (!activeSection) {
      return null;
    }
    const idx = sections.findIndex((s) => s.id === activeSection);
    for (let i = idx; i >= 0; i -= 1) {
      if ((sections[i].level ?? 2) <= 2) {
        return sections[i].id;
      }
    }
    return sections[0]?.id ?? null;
  }, [sections, activeSection]);

  // In-page search: count matches per section (in document order) so each
  // SectionBlock can label its own matches with a global index for highlighting,
  // and so next/prev can scroll to the section holding the active match.
  const findTerm = findQuery.trim();
  const findActive = findOpen && findTerm.length >= 2;
  const sectionMatchCounts = useMemo(() => {
    if (!findActive) {
      return [] as number[];
    }
    const q = findTerm.toLowerCase();
    return sections.map((s) => {
      let n = 0;
      for (const p of s.paragraphs) {
        if (isLinkList(p)) {
          continue;
        }
        for (const r of p.runs) {
          const text = r.text.toLowerCase();
          let i = text.indexOf(q);
          while (i !== -1) {
            n += 1;
            i = text.indexOf(q, i + q.length);
          }
        }
      }
      return n;
    });
  }, [findActive, findTerm, sections]);
  const matchOffsets = useMemo(() => {
    const offs: number[] = [];
    let acc = 0;
    for (const c of sectionMatchCounts) {
      offs.push(acc);
      acc += c;
    }
    return offs;
  }, [sectionMatchCounts]);
  const totalMatches = useMemo(
    () => sectionMatchCounts.reduce((a, b) => a + b, 0),
    [sectionMatchCounts],
  );

  // Reset to the first match whenever the query changes.
  useEffect(() => {
    setActiveMatch(0);
  }, [findTerm]);

  // Scroll to the section holding the active match as the user steps through them.
  useEffect(() => {
    if (!findActive || totalMatches === 0) {
      return;
    }
    let targetId = sections[0]?.id;
    for (let i = 0; i < sections.length; i += 1) {
      if (activeMatch >= matchOffsets[i] && activeMatch < matchOffsets[i] + sectionMatchCounts[i]) {
        targetId = sections[i].id;
        break;
      }
    }
    const idx = targetId ? sectionBlockIndexRef.current.get(targetId) : undefined;
    if (idx !== undefined) {
      listRef.current?.scrollToIndex({ index: idx, viewOffset: 80, animated: true });
    }
  }, [activeMatch, findActive, totalMatches, sections, matchOffsets, sectionMatchCounts]);

  const nextMatch = useCallback(() => {
    if (totalMatches) {
      setActiveMatch((m) => (m + 1) % totalMatches);
    }
  }, [totalMatches]);
  const prevMatch = useCallback(() => {
    if (totalMatches) {
      setActiveMatch((m) => (m - 1 + totalMatches) % totalMatches);
    }
  }, [totalMatches]);
  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery("");
  }, []);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const openWikiButton = (
    <Pressable
      onPress={openOriginal}
      style={styles.originalBtn}
      accessibilityRole="link"
      accessibilityLabel={t("article.openOriginal")}
    >
      <FontAwesome name="wikipedia-w" size={16} color={colors.accentLinkText} />
      <Text style={styles.originalBtnText}>{t("article.openOriginal")}</Text>
    </Pressable>
  );

  // Build the virtualized block list and the sectionId → index map.
  const blocks = useMemo<ArticleBlock[]>(() => {
    if (!article) {
      return [];
    }
    const list: ArticleBlock[] = [{ type: "head" }];
    article.sections.forEach((section, index) => list.push({ type: "section", section, index }));
    if (article.ancestry?.length) {
      list.push({ type: "ancestry" });
    }
    if (related.length) {
      list.push({ type: "exploreHeader" });
      related.forEach((a) => list.push({ type: "related", article: a }));
    } else if (article.links.length) {
      list.push({ type: "exploreChips" });
    } else {
      list.push({ type: "wikiAlone" });
    }
    list.push({ type: "source" });
    return list;
  }, [article, related]);

  // For each section, the ids of its ancestor sections (lower-level headings that
  // contain it), so collapsing a section also folds away its sub-sections.
  const sectionAncestors = useMemo<Map<string, string[]>>(() => {
    const map = new Map<string, string[]>();
    const stack: { level: number; id: string }[] = [];
    for (const section of article?.sections ?? []) {
      while (stack.length && stack[stack.length - 1].level >= section.level) {
        stack.pop();
      }
      map.set(
        section.id,
        stack.map((s) => s.id),
      );
      stack.push({ level: section.level, id: section.id });
    }
    return map;
  }, [article]);

  sectionBlockIndexRef.current = useMemo(() => {
    const map = new Map<string, number>();
    blocks.forEach((block, i) => {
      if (block.type === "section") {
        map.set(block.section.id, i);
      }
    });
    return map;
  }, [blocks]);

  const renderBlock = ({ item }: { item: ArticleBlock }) => {
    const a = article;
    if (!a) {
      return null;
    }
    switch (item.type) {
      case "head":
        return (
          <View style={[centeredColumn, styles.blockPad]}>
            <Text style={styles.category}>{a.category.toUpperCase()}</Text>
            <Text style={styles.title}>{a.title}</Text>
            <InfoCard
              article={a}
              colors={colors}
              onImagePress={(url, caption, marker) =>
                setLightbox({ url: largeImageUrl(url), caption, marker })
              }
            />
            {a.charts?.map((chart, i) => (
              <PieChartCard key={`chart-${i}`} chart={chart} colors={colors} />
            ))}
          </View>
        );
      case "section": {
        // Hidden when a parent section is collapsed (fold its sub-sections away).
        const ancestors = sectionAncestors.get(item.section.id) ?? [];
        if (ancestors.some((a) => collapsedSections.has(a))) {
          return null;
        }
        return (
          <View style={[centeredColumn, styles.blockPad]}>
            <SectionBlock
              section={item.section}
              showHeading={item.index > 0}
              level={item.section.level}
              styles={styles}
              colors={colors}
              mainArticleLabel={t("article.mainArticle")}
              viewImageLabel={t("a11y.viewImage")}
              contentWidth={contentWidth}
              query={findActive ? findTerm : undefined}
              matchOffset={findActive ? matchOffsets[item.index] ?? 0 : 0}
              activeMatch={activeMatch}
              onLinkPress={openLink}
              onImagePress={(url, caption, marker) =>
                setLightbox({ url: largeImageUrl(url), caption, marker })
              }
              onReadSection={readFromSection}
              canRead={speechAvailable}
              isReading={currentSectionId === item.section.id}
              readFromHereLabel={t("article.readFromHere")}
              collapsed={collapsedSections.has(item.section.id)}
              onToggleCollapse={toggleSection}
              toggleSectionLabel={t("a11y.toggleSection")}
            />
          </View>
        );
      }
      case "ancestry":
        return a.ancestry?.length ? (
          <View style={[centeredColumn, styles.blockPad]}>
            <Ancestry entries={a.ancestry} colors={colors} onLinkPress={openLink} />
          </View>
        ) : null;
      case "exploreHeader":
        return (
          <View style={[centeredColumn, styles.blockPad, styles.explore]}>
            <View style={styles.exploreHeaderRow}>
              <Text style={styles.exploreTitle}>{t("article.keepExploring")}</Text>
              {openWikiButton}
            </View>
          </View>
        );
      case "related":
        return (
          <View style={[centeredColumn, styles.relatedItem]}>
            <ArticleCard
              article={item.article}
              onOpen={() => openLink(item.article.id)}
              onShare={openShare}
            />
          </View>
        );
      case "exploreChips":
        return (
          <View style={[centeredColumn, styles.blockPad, styles.explore]}>
            <View style={styles.exploreHeaderRow}>
              <Text style={styles.exploreTitle}>{t("article.keepExploring")}</Text>
              {openWikiButton}
            </View>
            <View style={styles.exploreChips}>
              {a.links.map((link) => (
                <Pressable
                  key={link.targetId}
                  onPress={() => openLink(link.targetId)}
                  style={styles.exploreChip}
                  accessibilityRole="link"
                  accessibilityLabel={link.label}
                >
                  <Text style={styles.exploreChipText}>{link.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      case "wikiAlone":
        return (
          <View style={[centeredColumn, styles.blockPad, styles.wikiAlone]}>{openWikiButton}</View>
        );
      case "source":
        return (
          <View style={[centeredColumn, styles.blockPad]}>
            <Text style={styles.source}>{t("common.source")}</Text>
          </View>
        );
    }
  };

  return (
    <ScreenContainer style={{ paddingTop: insets.top }}>
      <View style={styles.flex} {...panResponder.panHandlers}>
      <View style={[styles.header, centeredColumn]}>
        <View style={styles.headerLeft}>
          <Pressable
            onPress={goBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t("a11y.goBack")}
          >
            <MaterialIcons name="arrow-back" size={26} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={goHome}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t("a11y.goHome")}
          >
            <MaterialIcons name="home" size={23} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.headerActions}>
          {speechAvailable ? (
            <>
              <Pressable
                onPress={toggleSpeech}
                hitSlop={12}
                disabled={!article}
                accessibilityRole="button"
                accessibilityState={{ selected: speaking || paused }}
                accessibilityLabel={
                  speaking
                    ? t("article.pauseReading")
                    : paused
                      ? t("article.resumeReading")
                      : t("article.listen")
                }
              >
                <MaterialIcons
                  name={speaking ? "pause" : paused ? "play-arrow" : "volume-up"}
                  size={23}
                  color={speaking || paused ? colors.accent : colors.textPrimary}
                />
              </Pressable>
              {speaking || paused ? (
                <Pressable
                  onPress={stopSpeech}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={t("article.stopReading")}
                >
                  <MaterialIcons name="stop" size={23} color={colors.textPrimary} />
                </Pressable>
              ) : null}
            </>
          ) : null}
          <Pressable
            onPress={() => setFindOpen((v) => !v)}
            hitSlop={12}
            disabled={!article}
            accessibilityRole="button"
            accessibilityState={{ expanded: findOpen }}
            accessibilityLabel={t("a11y.findInPage")}
          >
            <MaterialIcons
              name="search"
              size={23}
              color={findOpen ? colors.accent : colors.textPrimary}
            />
          </Pressable>
          <Pressable
            onPress={openOriginal}
            hitSlop={12}
            disabled={!article}
            accessibilityRole="button"
            accessibilityLabel={t("a11y.openOnWikipedia")}
          >
            <FontAwesome name="wikipedia-w" size={19} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => article && toggleLike(article)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityState={{ selected: Boolean(article && isLiked(article.id)) }}
            accessibilityLabel={article && isLiked(article.id) ? t("a11y.liked") : t("a11y.like")}
          >
            <MaterialIcons
              name={article && isLiked(article.id) ? "favorite" : "favorite-border"}
              size={24}
              color={article && isLiked(article.id) ? colors.like : colors.textPrimary}
            />
          </Pressable>
          <Pressable
            onPress={() => article && toggleSave(article)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityState={{ selected: Boolean(article && isSaved(article.id)) }}
            accessibilityLabel={article && isSaved(article.id) ? t("a11y.saved") : t("a11y.save")}
          >
            <MaterialIcons
              name={article && isSaved(article.id) ? "bookmark" : "bookmark-border"}
              size={24}
              color={article && isSaved(article.id) ? colors.accent : colors.textPrimary}
            />
          </Pressable>
          <Pressable
            onPress={() => article && openShare(article)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t("a11y.share")}
          >
            <MaterialIcons name="send" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {findOpen ? (
        <View style={[styles.findBar, centeredColumn]}>
          <MaterialIcons name="search" size={20} color={colors.muted} />
          <TextInput
            value={findQuery}
            onChangeText={setFindQuery}
            placeholder={t("article.findPlaceholder")}
            placeholderTextColor={colors.muted}
            style={styles.findInput}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={nextMatch}
            accessibilityLabel={t("a11y.findInPage")}
          />
          <Text
            style={styles.findCount}
            accessibilityLiveRegion="polite"
            accessibilityLabel={
              findActive ? `${totalMatches ? activeMatch + 1 : 0}/${totalMatches}` : undefined
            }
          >
            {findActive ? (totalMatches ? `${activeMatch + 1}/${totalMatches}` : "0/0") : ""}
          </Text>
          <Pressable
            onPress={prevMatch}
            hitSlop={12}
            disabled={totalMatches === 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: totalMatches === 0 }}
            accessibilityLabel={t("a11y.previousMatch")}
          >
            <MaterialIcons
              name="keyboard-arrow-up"
              size={24}
              color={totalMatches === 0 ? colors.mutedLight : colors.textPrimary}
            />
          </Pressable>
          <Pressable
            onPress={nextMatch}
            hitSlop={12}
            disabled={totalMatches === 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: totalMatches === 0 }}
            accessibilityLabel={t("a11y.nextMatch")}
          >
            <MaterialIcons
              name="keyboard-arrow-down"
              size={24}
              color={totalMatches === 0 ? colors.mutedLight : colors.textPrimary}
            />
          </Pressable>
          <Pressable
            onPress={closeFind}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t("a11y.close")}
          >
            <MaterialIcons name="close" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      ) : null}

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
          {topSections.length > 1 && !tocAsSidebar ? (
            <View style={[styles.chipsBar, centeredColumn]}>
              <ScrollView
                ref={chipsScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                {topSections.map((section) => {
                  const active = section.id === activeTopId;
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
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={section.title}
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

          <View style={styles.scrollWrap}>
          {/* Slim title bar that slides in over the content on scroll-up (an
              overlay, so it never shifts the page layout). */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.subHeader,
              {
                opacity: subHeaderAnim,
                transform: [
                  {
                    translateY: subHeaderAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-SUBHEADER_HEIGHT, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={[styles.subHeaderInner, centeredColumn]}>
              <Text style={styles.subHeaderTitle} numberOfLines={1}>
                {article.title}
              </Text>
            </View>
          </Animated.View>

          <FlashList
            ref={listRef}
            data={blocks}
            renderItem={renderBlock}
            extraData={collapsedSections}
            keyExtractor={(item, index) =>
              item.type === "section"
                ? `s-${item.section.id}`
                : item.type === "related"
                  ? `r-${item.article.id}`
                  : `${item.type}-${index}`
            }
            getItemType={(item) => item.type}
            scrollEventThrottle={16}
            onScroll={onScroll}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            onEndReached={() => void loadMoreRelated()}
            onEndReachedThreshold={1.2}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListFooterComponent={
              relatedCursor ? (
                <ActivityIndicator color={colors.muted} style={styles.relatedLoader} />
              ) : null
            }
          />
          </View>

          {/* Web: fixed table-of-contents sidebar on the right, with collapsible
              sub-sections (collapsed by default). */}
          {topSections.length > 1 && tocAsSidebar ? (
            <View style={[styles.tocSidebar, { right: Math.max(TOC_GAP, tocRightOffset) }]}>
              <Text style={styles.tocTitle}>{t("article.contents")}</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {tocTree.map(({ section, children }) => {
                  const active = section.id === activeTopId;
                  const open = expandedGroups.has(section.id) || section.id === activeTopId;
                  return (
                    <View key={section.id}>
                      <View style={styles.tocItem}>
                        <View style={[styles.tocBar, !active && styles.tocBarHidden]} />
                        <Pressable
                          style={styles.tocItemLabel}
                          onPress={() => jumpToSection(section.id)}
                          accessibilityRole="link"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={section.title}
                        >
                          <Text
                            style={[styles.tocText, active && styles.tocTextActive]}
                            numberOfLines={2}
                          >
                            {section.title}
                          </Text>
                        </Pressable>
                        {children.length ? (
                          <Pressable
                            onPress={() => toggleGroup(section.id)}
                            hitSlop={12}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: open }}
                            accessibilityLabel={t("a11y.toggleSubsections")}
                          >
                            <MaterialIcons
                              name={open ? "expand-less" : "expand-more"}
                              size={20}
                              color={colors.muted}
                            />
                          </Pressable>
                        ) : null}
                      </View>
                      {open
                        ? children.map((child) => {
                            const childActive = child.id === activeSection;
                            return (
                              <Pressable
                                key={child.id}
                                onPress={() => jumpToSection(child.id)}
                                style={styles.tocSubItem}
                                accessibilityRole="link"
                                accessibilityState={{ selected: childActive }}
                                accessibilityLabel={child.title}
                              >
                                <Text
                                  style={[styles.tocSubText, childActive && styles.tocTextActive]}
                                  numberOfLines={2}
                                >
                                  {child.title}
                                </Text>
                              </Pressable>
                            );
                          })
                        : null}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {showScrollTop ? (
            <Pressable
              onPress={scrollToTop}
              style={[styles.toTop, { bottom: insets.bottom + 24 }]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.scrollToTop")}
            >
              <MaterialIcons name="keyboard-arrow-up" size={28} color={colors.bg} />
            </Pressable>
          ) : null}
        </>
      )}
      </View>

      <Modal
        visible={lightbox !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLightbox(null)}
      >
        <Pressable
          style={styles.lightbox}
          onPress={() => setLightbox(null)}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.close")}
        >
          {lightbox ? (
            <>
              {lightbox.marker ? (
                // Locator map: size the box to the image's exact aspect ratio
                // (fit within the screen) so the pin can be positioned by % over
                // the now box-filling image — no letterboxing to throw it off.
                (() => {
                  const ratio = lightbox.marker.ratio || 1;
                  const maxW = windowWidth * 0.94;
                  const maxH = windowHeight * 0.78;
                  let w = maxW;
                  let h = w / ratio;
                  if (h > maxH) {
                    h = maxH;
                    w = h * ratio;
                  }
                  return (
                    <View style={{ width: w, height: h, position: "relative" }}>
                      <RemoteImage
                        source={{ uri: lightbox.url }}
                        style={styles.lightboxMapImage}
                        resizeMode="contain"
                        noBackdrop
                        accessibilityLabel={lightbox.caption ?? article?.title}
                      />
                      <View
                        style={[
                          styles.lightboxPin,
                          { top: `${lightbox.marker.top}%`, left: `${lightbox.marker.left}%` },
                        ]}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                      />
                    </View>
                  );
                })()
              ) : (
                <RemoteImage
                  source={{ uri: lightbox.url }}
                  style={styles.lightboxImage}
                  resizeMode="contain"
                  noBackdrop
                  accessibilityLabel={lightbox.caption ?? article?.title}
                />
              )}
              {lightbox.caption ? (
                <Text style={styles.lightboxCaption}>{lightbox.caption}</Text>
              ) : null}
            </>
          ) : null}
          <Pressable
            style={styles.lightboxClose}
            onPress={() => setLightbox(null)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t("a11y.close")}
          >
            <MaterialIcons name="close" size={28} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

interface SectionBlockProps {
  section: ArticleSection;
  showHeading: boolean;
  /** Heading depth (2 = section, 3+ = sub-section → progressively smaller title). */
  level: number;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  mainArticleLabel: string;
  /** Accessibility label for tappable figures ("view image full screen"). */
  viewImageLabel: string;
  /** Usable column width, so narrow tables stretch to fill it. */
  contentWidth: number;
  /** Active in-page search term (highlights matches); undefined when inactive. */
  query?: string;
  /** Global index of this section's first match (for active-match highlighting). */
  matchOffset: number;
  /** Index of the currently focused match across the whole article. */
  activeMatch: number;
  onLinkPress: (targetId: string) => void;
  onImagePress: (
    url: string,
    caption?: string,
    marker?: { top: number; left: number; ratio: number },
  ) => void;
  /** Start reading aloud from this section. */
  onReadSection: (sectionId: string) => void;
  /** Whether TTS is available (hides the per-section "read from here" button). */
  canRead: boolean;
  /** True when the TTS is currently reading this section (highlights heading). */
  isReading: boolean;
  /** Accessibility label for the per-section "read from here" button. */
  readFromHereLabel: string;
  /** True when this section's body is collapsed (heading shown, content hidden). */
  collapsed: boolean;
  /** Toggle this section collapsed/expanded (only when it has a heading). */
  onToggleCollapse: (sectionId: string) => void;
  /** Accessibility label for the collapse/expand toggle. */
  toggleSectionLabel: string;
}

/**
 * Render a run's text, wrapping in-page-search matches in highlight <Text>. The
 * shared `counter` keeps a running global match index (in document order) so the
 * active match can be styled differently and stay in sync with the parent count.
 */
function highlightedText(
  text: string,
  query: string | undefined,
  counter: { n: number },
  matchOffset: number,
  activeMatch: number,
  styles: ReturnType<typeof makeStyles>,
): ReactNode {
  if (!query) {
    return text;
  }
  const q = query.toLowerCase();
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;
  let idx = lower.indexOf(q);
  while (idx !== -1) {
    if (idx > i) {
      parts.push(<Text key={`t${key++}`}>{text.slice(i, idx)}</Text>);
    }
    const global = matchOffset + counter.n;
    counter.n += 1;
    parts.push(
      <Text key={`m${key++}`} style={global === activeMatch ? styles.matchActive : styles.match}>
        {text.slice(idx, idx + q.length)}
      </Text>,
    );
    i = idx + q.length;
    idx = lower.indexOf(q, i);
  }
  if (i < text.length) {
    parts.push(<Text key={`t${key++}`}>{text.slice(i)}</Text>);
  }
  return parts;
}

/** A paragraph that is essentially a list of links (e.g. the "sigles" pages). */
function isLinkList(paragraph: ArticleSection["paragraphs"][number]): boolean {
  const meaningful = paragraph.runs.filter((r) => r.text.trim().length > 0);
  return meaningful.length >= 3 && meaningful.every((r) => Boolean(r.linkTargetId));
}

function SectionBlock({
  section,
  showHeading,
  level,
  styles,
  colors,
  mainArticleLabel,
  viewImageLabel,
  contentWidth,
  query,
  matchOffset,
  activeMatch,
  onLinkPress,
  onImagePress,
  onReadSection,
  canRead,
  isReading,
  readFromHereLabel,
  collapsed,
  onToggleCollapse,
  toggleSectionLabel,
}: SectionBlockProps) {
  // Running global match index for this section's highlighted prose (in render
  // order), starting at the section's offset so it aligns with the parent count.
  const matchCounter = { n: 0 };
  return (
    <View style={styles.section}>
      {showHeading ? (
        <View style={styles.sectionTitleRow}>
          <Pressable
            style={styles.sectionTitlePress}
            onPress={() => onToggleCollapse(section.id)}
            accessibilityRole="button"
            accessibilityState={{ expanded: !collapsed }}
            accessibilityLabel={`${section.title}, ${toggleSectionLabel}`}
          >
            <MaterialIcons
              name={collapsed ? "chevron-right" : "expand-more"}
              size={22}
              color={colors.muted}
            />
            <Text
              style={[
                styles.sectionTitle,
                level >= 4 && styles.sectionTitleL4,
                level === 3 && styles.sectionTitleL3,
                isReading && styles.sectionTitleReading,
              ]}
            >
              {section.title}
            </Text>
          </Pressable>
          {canRead ? (
            <Pressable
              onPress={() => onReadSection(section.id)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={readFromHereLabel}
            >
              <MaterialIcons
                name="volume-up"
                size={18}
                color={isReading ? colors.accent : colors.muted}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {collapsed ? null : (
      <>
      {/* {{Article détaillé}} pointer(s) to a dedicated page. */}
      {section.mainLinks?.length ? (
        <View style={styles.mainLinkBox}>
          <MaterialIcons name="menu-book" size={16} color={colors.accentDark} />
          <Text style={styles.mainLinkLabel}>{mainArticleLabel} : </Text>
          {section.mainLinks.map((link, i) => (
            <Text
              key={link.targetId}
              style={styles.mainLinkText}
              onPress={() => onLinkPress(link.targetId)}
            >
              {i > 0 ? " · " : ""}
              {link.label}
            </Text>
          ))}
        </View>
      ) : null}

      {section.images?.map((img, i) => (
        <Pressable
          key={`img-${i}`}
          style={styles.figure}
          onPress={() => onImagePress(img.url, img.caption)}
          accessibilityRole="imagebutton"
          accessibilityLabel={img.caption ? `${img.caption}, ${viewImageLabel}` : viewImageLabel}
        >
          <RemoteImage
            source={{ uri: img.url }}
            style={[
              styles.figureImage,
              img.width && img.height ? { aspectRatio: img.width / img.height } : null,
            ]}
            resizeMode="cover"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          {img.caption ? <Text style={styles.figureCaption}>{img.caption}</Text> : null}
        </Pressable>
      ))}

      {section.tables?.map((table, tIndex) => {
        // Stretch the columns to fill the content width when there are few of
        // them (no wasted empty space); fall back to a min width + horizontal
        // scroll when the table is genuinely wide.
        const cols = table.headers.length || 1;
        const cellWidth = Math.max(100, Math.floor(contentWidth / cols));
        const cellSize = { width: cellWidth };
        return (
        <ScrollView
          key={`table-${tIndex}`}
          horizontal
          showsHorizontalScrollIndicator
          style={styles.tableScroll}
        >
          <View>
            <View style={[styles.tableRow, styles.tableHeaderRow]}>
              {table.headers.map((header, cIndex) => (
                <View key={cIndex} style={[styles.tableCellBox, cellSize]}>
                  <Text style={styles.tableHeaderCell}>{header}</Text>
                </View>
              ))}
            </View>
            {table.rows.map((row, rIndex) => (
              <View
                key={rIndex}
                style={[styles.tableRow, rIndex % 2 === 1 && styles.tableRowAlt]}
              >
                {row.map((cell, cIndex) => (
                  <View
                    key={cIndex}
                    style={[
                      styles.tableCellBox,
                      cellSize,
                      cell.background ? { backgroundColor: cell.background } : null,
                    ]}
                  >
                    {cell.image ? (
                      <RemoteImage
                        source={{ uri: cell.image }}
                        style={styles.tableCellImage}
                        resizeMode="cover"
                      />
                    ) : null}
                    {cell.runs.length ? (
                      <Text
                        style={[
                          styles.tableCell,
                          cell.background ? styles.tableCellOnColor : null,
                        ]}
                      >
                        {cell.runs.map((run, runIndex) =>
                          run.swatch ? (
                            <Text key={runIndex}>
                              <Text style={[styles.legendSwatch, { backgroundColor: run.swatch }]}>
                                {"  "}
                              </Text>
                              {" "}
                            </Text>
                          ) : run.linkTargetId ? (
                            <Text
                              key={runIndex}
                              style={styles.link}
                              onPress={() => onLinkPress(run.linkTargetId as string)}
                            >
                              {run.text}
                            </Text>
                          ) : (
                            <Text key={runIndex}>{run.text}</Text>
                          ),
                        )}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
        );
      })}

      {section.paragraphs.map((paragraph, pIndex) =>
        isLinkList(paragraph) ? (
          <View key={pIndex} style={styles.chipGrid}>
            {paragraph.runs
              .filter((r) => r.linkTargetId)
              .map((run, rIndex) => (
                <Pressable
                  key={rIndex}
                  style={styles.linkChip}
                  onPress={() => onLinkPress(run.linkTargetId as string)}
                  accessibilityRole="link"
                  accessibilityLabel={run.text.trim()}
                >
                  <Text style={styles.linkChipText}>{run.text.trim()}</Text>
                </Pressable>
              ))}
          </View>
        ) : (
          <Text key={pIndex} style={styles.paragraph}>
            {paragraph.runs.map((run, rIndex) =>
              run.swatch ? (
                <Text key={rIndex}>
                  <Text style={[styles.legendSwatch, { backgroundColor: run.swatch }]}>
                    {"  "}
                  </Text>
                  {" "}
                </Text>
              ) : run.linkTargetId ? (
                <Text
                  key={rIndex}
                  style={styles.link}
                  onPress={() => onLinkPress(run.linkTargetId as string)}
                >
                  {highlightedText(run.text, query, matchCounter, matchOffset, activeMatch, styles)}
                </Text>
              ) : (
                <Text key={rIndex}>
                  {highlightedText(run.text, query, matchCounter, matchOffset, activeMatch, styles)}
                </Text>
              ),
            )}
          </Text>
        ),
      )}
      </>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 10,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  // Wraps the scroll view so the title sub-header can overlay it.
  scrollWrap: { flex: 1 },
  // Slide-in title sub-header — absolute overlay (never shifts the page).
  subHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    overflow: "hidden",
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  subHeaderInner: { height: SUBHEADER_HEIGHT, justifyContent: "center", paddingHorizontal: spacing.screenPadding },
  subHeaderTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  // In-page search bar.
  findBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  findInput: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 4 },
  findCount: { color: colors.muted, fontSize: 13, minWidth: 34, textAlign: "right" },
  // Highlighted in-page-search matches.
  match: { backgroundColor: "rgba(255, 213, 0, 0.45)", color: colors.textPrimary },
  matchActive: { backgroundColor: colors.accent, color: colors.bg },
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
  // Virtualized list: per-block horizontal padding (related cards bring their own).
  listContent: { paddingBottom: 48 },
  blockPad: { paddingHorizontal: spacing.screenPadding },
  relatedItem: { marginBottom: spacing.cardGap },
  // Section illustrations — kept small (so the thumbnail isn't upscaled) and
  // tappable to view full-size.
  figure: { marginTop: 4, marginBottom: 14, alignItems: "center" },
  figureImage: {
    width: "100%",
    maxWidth: 320,
    height: undefined,
    aspectRatio: 1.4,
    borderRadius: radii.media,
    backgroundColor: colors.field,
  },
  figureCaption: {
    color: colors.textTertiary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    textAlign: "center",
  },
  // Full-size image lightbox.
  lightbox: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxImage: { width: "100%", height: "78%" },
  lightboxMapImage: { width: "100%", height: "100%" },
  // Place marker over the enlarged locator map (bigger than the thumbnail pin).
  lightboxPin: {
    position: "absolute",
    width: 22,
    height: 22,
    marginTop: -11,
    marginLeft: -11,
    borderRadius: 11,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: "#fff",
  },
  lightboxCaption: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    paddingHorizontal: 24,
    marginTop: 16,
  },
  lightboxClose: { position: "absolute", top: 44, right: 20 },
  // {{Article détaillé}} pointer.
  mainLinkBox: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.field,
    borderRadius: radii.media,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  mainLinkLabel: { color: colors.muted, fontSize: 13, fontStyle: "italic" },
  mainLinkText: { color: colors.accentLinkText, fontSize: 13, fontWeight: "600" },
  // Link-list paragraph rendered as chips (e.g. the "sigles" pages).
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  linkChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.field,
  },
  linkChipText: { color: colors.accentLinkText, fontSize: 14, fontWeight: "500" },
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
  // Heading row: the title plus a "read from here" speaker button.
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: "600",
  },
  // Sub-section headings: progressively smaller than a top-level section title.
  sectionTitleL3: { fontSize: 16 },
  sectionTitleL4: { fontSize: 14, color: colors.textSecondary },
  // Tappable heading (collapse/expand): chevron + title, 44px tall touch target.
  sectionTitlePress: { flex: 1, flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44 },
  // The section currently being read aloud.
  sectionTitleReading: { color: colors.accent },
  paragraph: { color: colors.textSecondary, fontSize: 16, lineHeight: 26, marginBottom: 12 },
  // Content tables (wikitables) — horizontally scrollable, aligned columns.
  tableScroll: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radii.media,
  },
  tableRow: { flexDirection: "row" },
  tableHeaderRow: { backgroundColor: colors.field },
  tableRowAlt: { backgroundColor: colors.surface },
  // Cell box carries the width, padding, borders and (when meaningful) the
  // colour-code background; the inner Text only styles the text.
  tableCellBox: {
    width: 140,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  tableCell: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  // Wikipedia colour-codes are light pastels meant for black text → force a dark
  // text colour on coloured cells so it stays legible (incl. dark mode).
  tableCellOnColor: { color: "#1a1a1a" },
  tableCellImage: {
    width: 54,
    height: 54,
    borderRadius: radii.media,
    backgroundColor: colors.field,
    alignSelf: "center",
    marginBottom: 4,
  },
  tableHeaderCell: { color: colors.textPrimary, fontWeight: "700", fontSize: 12 },
  link: {
    color: colors.accentLinkText,
    textDecorationLine: "underline",
    textDecorationColor: colors.accentLinkUnderline,
  },
  // Inline colour key (results-grid legend): a small filled square. The spaces
  // give it width; the colour is applied inline from the run's `swatch`.
  legendSwatch: { fontSize: 13, borderRadius: 3, color: "transparent" },
  explore: { marginTop: 28 },
  exploreTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 12,
  },
  // Cards carry their own horizontal padding — cancel the content padding so
  // they sit edge-to-edge in the centered column, like the home feed.
  relatedLoader: { marginTop: 20 },
  exploreChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  exploreChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.field,
  },
  exploreChipText: { color: colors.accentLinkText, fontSize: 14 },
  // Header row of the "keep exploring" section: title left, Wikipedia button
  // right (so the related feed rises and less space is wasted).
  exploreHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  wikiAlone: { alignItems: "flex-end", marginTop: 20 },
  originalBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: colors.field,
  },
  originalBtnText: { color: colors.accentLinkText, fontSize: 14, fontWeight: "600" },
  source: { color: colors.mutedLight, fontSize: 12, marginTop: 16 },
  // Web TOC sidebar.
  tocSidebar: { position: "absolute", top: 16, width: 220, maxHeight: "82%" },
  tocTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  tocItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  tocItemLabel: { flex: 1 },
  tocBar: { width: 3, height: 16, borderRadius: 2, backgroundColor: colors.accent },
  tocBarHidden: { backgroundColor: "transparent" },
  tocText: { color: colors.textSecondary, fontSize: 14 },
  tocTextActive: { color: colors.textPrimary, fontWeight: "600" },
  tocSubItem: { paddingVertical: 4, paddingLeft: 11 },
  tocSubText: { color: colors.textTertiary, fontSize: 13 },
  // Scroll-to-top button.
  toTop: {
    position: "absolute",
    right: 20,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
