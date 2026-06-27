import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import type { Article } from "@flowpedia/shared";
import { RemoteImage } from "./RemoteImage";
import { radii, spacing, useTheme, type ThemeColors } from "../theme";
import { useLocale } from "../i18n";
import { useLibrary } from "../library/LibraryProvider";

const COLLAPSED_LINES = 3;

interface ArticleCardProps {
  article: Article;
  onShare?: (article: Article) => void;
  onOpen?: (article: Article) => void;
}

/** Feed card — handoff screen 1. Like/save state comes from the local library. */
export function ArticleCard({ article, onShare, onOpen }: ArticleCardProps) {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { isLiked, isSaved, toggleLike, toggleSave } = useLibrary();
  const liked = isLiked(article.id);
  const saved = isSaved(article.id);
  const [expanded, setExpanded] = useState(false);
  // Total line count, measured once while the summary is rendered unclamped.
  const [lineCount, setLineCount] = useState(0);
  const canExpand = lineCount > COLLAPSED_LINES;

  const handleTextLayout = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    if (lineCount === 0) {
      setLineCount(e.nativeEvent.lines.length);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.metaRow}>
        <Text style={styles.category}>{article.category.toUpperCase()}</Text>
        {article.readingMinutes ? (
          <Text style={styles.meta}>
            {"  ·  " + t("article.minRead", { count: article.readingMinutes })}
          </Text>
        ) : null}
      </View>

      <Pressable onPress={() => onOpen?.(article)}>
        {article.image ? (
          <RemoteImage source={{ uri: article.image }} style={styles.image} resizeMode="contain" />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}
        <Text style={styles.title}>{article.title}</Text>
      </Pressable>
      <Text
        style={styles.summary}
        // Unclamped until measured so handleTextLayout sees the true line count.
        numberOfLines={expanded || lineCount === 0 ? undefined : COLLAPSED_LINES}
        onTextLayout={handleTextLayout}
      >
        {article.summary}
      </Text>

      {canExpand ? (
        <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8}>
          <View style={styles.readMoreRow}>
            <Text style={styles.readMore}>
              {expanded ? t("article.showLess") : t("article.readMore")}
            </Text>
            <MaterialIcons
              name={expanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
              size={18}
              color={colors.accent}
            />
          </View>
        </Pressable>
      ) : null}

      <View style={styles.actions}>
        <View style={styles.actionsLeft}>
          <Pressable style={styles.actionBtn} onPress={() => toggleLike(article)} hitSlop={8}>
            <MaterialIcons
              name={liked ? "favorite" : "favorite-border"}
              size={24}
              color={liked ? colors.like : colors.textPrimary}
            />
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => onShare?.(article)} hitSlop={8}>
            <MaterialIcons name="send" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
        <Pressable onPress={() => toggleSave(article)} hitSlop={8}>
          <MaterialIcons
            name={saved ? "bookmark" : "bookmark-border"}
            size={24}
            color={saved ? colors.accent : colors.textPrimary}
          />
        </Pressable>
      </View>

      <Text style={styles.source}>{t("common.source")}</Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.bg,
      paddingHorizontal: spacing.screenPadding,
      paddingVertical: 16,
    },
    metaRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    category: {
      color: colors.accentDark,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
    },
    meta: { color: colors.mutedLight, fontSize: 12 },
    // Whole image shown (no crop) on a neutral backdrop; portrait images appear
    // naturally narrower than the card.
    image: { width: "100%", height: 240, borderRadius: radii.media, backgroundColor: colors.field },
    imagePlaceholder: { backgroundColor: colors.separatorThick },
    title: {
      color: colors.textPrimary,
      fontSize: 21,
      fontWeight: "600",
      lineHeight: 25,
      marginTop: 12,
    },
    summary: { color: colors.textSecondary, fontSize: 15, lineHeight: 23, marginTop: 8 },
    readMoreRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
    readMore: { color: colors.accent, fontSize: 15, fontWeight: "600" },
    actions: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 14,
    },
    actionsLeft: { flexDirection: "row", alignItems: "center", gap: 18 },
    actionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
    source: { color: colors.mutedLight, fontSize: 12, marginTop: 12 },
  });
