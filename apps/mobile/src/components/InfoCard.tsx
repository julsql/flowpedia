import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import type { Article } from "@flowpedia/shared";
import { RemoteImage } from "./RemoteImage";
import { useLocale } from "../i18n";
import { radii, type ThemeColors } from "../theme";

// Side-by-side image width (wide screens). On phones the image sits on top.
const IMAGE_WIDTH = 132;
const IMAGE_MAX_HEIGHT = 200;
const STACKED_IMAGE_MAX_WIDTH = 240;
// Below this width the card stacks (image on top) so facts get the full width.
const STACK_BREAKPOINT = 560;
// Facts shown before the "show more" toggle (big infoboxes like a company).
const COLLAPSED_ROWS = 7;

interface InfoCardProps {
  article: Article;
  colors: ThemeColors;
}

/**
 * Emblematic Wikipedia summary card, restyled as a profile-style header: lead
 * image on the side (aspect ratio kept) + key facts. Falls back to the lead
 * image alone when the page has no infobox.
 */
export function InfoCard({ article, colors }: InfoCardProps) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useLocale();
  const { width: windowWidth } = useWindowDimensions();
  // On a phone, stack the image on top so the facts get the full card width.
  const stacked = windowWidth < STACK_BREAKPOINT;
  const [expanded, setExpanded] = useState(false);
  const infobox = article.infobox;
  const image = infobox?.image ?? article.image;
  const width = infobox?.image ? infobox.imageWidth : article.imageWidth;
  const height = infobox?.image ? infobox.imageHeight : article.imageHeight;
  const allRows = infobox?.rows ?? [];

  if (!image && allRows.length === 0) {
    return null;
  }

  const canExpand = allRows.length > COLLAPSED_ROWS + 1;
  const rows = canExpand && !expanded ? allRows.slice(0, COLLAPSED_ROWS) : allRows;

  const ratio = width && height ? width / height : undefined;
  const imageHeight = ratio ? Math.min(IMAGE_WIDTH / ratio, IMAGE_MAX_HEIGHT) : 150;
  const imageStyle = stacked
    ? [styles.imageStacked, ratio ? { aspectRatio: ratio } : { height: 200 }]
    : [styles.image, { width: IMAGE_WIDTH, height: imageHeight }];

  return (
    <View style={[styles.card, stacked && styles.cardStacked]}>
      {image ? (
        <RemoteImage source={{ uri: image }} style={imageStyle} resizeMode="cover" />
      ) : null}
      {allRows.length ? (
        <View style={[styles.facts, stacked ? styles.factsStacked : styles.factsRow]}>
          {rows.map((row, i) =>
            row.heading ? (
              <Text key={i} style={[styles.heading, i > 0 && styles.headingSpaced]}>
                {row.value}
              </Text>
            ) : (
              <View key={i} style={styles.factRow}>
                <Text style={styles.factLabel}>{row.label}</Text>
                <Text style={styles.factValue}>{row.value}</Text>
              </View>
            ),
          )}
          {canExpand ? (
            <Pressable
              style={styles.toggle}
              onPress={() => setExpanded((v) => !v)}
              hitSlop={6}
            >
              <Text style={styles.toggleText}>
                {expanded ? t("article.showLess") : t("article.readMore")}
              </Text>
              <MaterialIcons
                name={expanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                size={18}
                color={colors.accent}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      gap: 14,
      marginTop: 16,
      padding: 12,
      borderRadius: radii.media,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.separator,
    },
    cardStacked: { flexDirection: "column", gap: 12 },
    image: { borderRadius: radii.media, backgroundColor: colors.field, alignSelf: "flex-start" },
    imageStacked: {
      width: "100%",
      maxWidth: STACKED_IMAGE_MAX_WIDTH,
      alignSelf: "center",
      borderRadius: radii.media,
      backgroundColor: colors.field,
    },
    facts: { justifyContent: "center", gap: 9 },
    factsRow: { flex: 1 },
    factsStacked: { width: "100%" },
    heading: {
      color: colors.accentDark,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    headingSpaced: {
      marginTop: 5,
      paddingTop: 9,
      borderTopWidth: 1,
      borderTopColor: colors.separator,
    },
    factRow: { flexDirection: "row", gap: 10 },
    factLabel: { color: colors.muted, fontSize: 13, width: 120, lineHeight: 19 },
    factValue: { color: colors.textPrimary, fontSize: 14, flex: 1, lineHeight: 19 },
    toggle: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
    toggleText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  });
