import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
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
  /** Open the lead/infobox image full-size (lightbox). */
  onImagePress?: (url: string, caption?: string) => void;
}

/**
 * Emblematic Wikipedia summary card, restyled as a profile-style header: lead
 * image on the side (aspect ratio kept) + key facts. Falls back to the lead
 * image alone when the page has no infobox.
 */
export function InfoCard({ article, colors, onImagePress }: InfoCardProps) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useLocale();
  const { width: windowWidth } = useWindowDimensions();
  // Stack the image on top (facts get the full card width) on every phone, and
  // on a narrow web window. Only a wide web window keeps the side-by-side layout.
  const stacked = Platform.OS !== "web" || windowWidth < STACK_BREAKPOINT;
  const [expanded, setExpanded] = useState(false);
  const infobox = article.infobox;
  const image = infobox?.image ?? article.image;
  const width = infobox?.image ? infobox.imageWidth : article.imageWidth;
  const height = infobox?.image ? infobox.imageHeight : article.imageHeight;
  const allRows = infobox?.rows ?? [];

  // Locator/position map (e.g. a region within its country), shown under the card.
  // Skip it when it's the very same file as the lead image (avoids a duplicate).
  const mapUrl = infobox?.mapImage !== image ? infobox?.mapImage : undefined;
  const mapRatio =
    infobox?.mapImageWidth && infobox?.mapImageHeight
      ? infobox.mapImageWidth / infobox.mapImageHeight
      : 1;
  const mapThumb = mapUrl ? (
    <Pressable
      disabled={!onImagePress}
      onPress={() => onImagePress?.(mapUrl, t("article.locatorMap"))}
      style={styles.mapBox}
      accessibilityRole={onImagePress ? "imagebutton" : "image"}
      accessibilityLabel={
        onImagePress ? `${t("article.locatorMap")}, ${t("a11y.viewMap")}` : t("article.locatorMap")
      }
    >
      <RemoteImage
        source={{ uri: mapUrl }}
        style={[styles.mapImage, { aspectRatio: mapRatio }]}
        resizeMode="contain"
      />
      <Text style={styles.mapCaption}>{t("article.locatorMap")}</Text>
    </Pressable>
  ) : null;

  if (!image && allRows.length === 0) {
    return mapThumb;
  }

  const ratioSolo = width && height ? width / height : 1.6;
  // No infobox facts → show just the lead image (no empty bordered card).
  if (allRows.length === 0) {
    return (
      <>
        <Pressable
          disabled={!image || !onImagePress}
          onPress={() => image && onImagePress?.(image, article.title)}
          accessibilityRole={onImagePress ? "imagebutton" : "image"}
          accessibilityLabel={
            onImagePress ? `${article.title}, ${t("a11y.viewImage")}` : article.title
          }
        >
          <RemoteImage
            source={{ uri: image }}
            style={[styles.soloImage, { aspectRatio: ratioSolo }]}
            resizeMode="cover"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </Pressable>
        {mapThumb}
      </>
    );
  }

  const canExpand = allRows.length > COLLAPSED_ROWS + 1;
  const rows = canExpand && !expanded ? allRows.slice(0, COLLAPSED_ROWS) : allRows;

  const ratio = width && height ? width / height : undefined;
  const imageHeight = ratio ? Math.min(IMAGE_WIDTH / ratio, IMAGE_MAX_HEIGHT) : 150;
  const imageStyle = stacked
    ? [styles.imageStacked, ratio ? { aspectRatio: ratio } : { height: 200 }]
    : [styles.image, { width: IMAGE_WIDTH, height: imageHeight }];

  return (
    <>
      <View style={[styles.card, stacked && styles.cardStacked]}>
      {image ? (
        <Pressable
          disabled={!onImagePress}
          onPress={() => onImagePress?.(image, article.title)}
          style={stacked ? styles.imagePressStacked : undefined}
          accessibilityRole={onImagePress ? "imagebutton" : "image"}
          accessibilityLabel={
            onImagePress ? `${article.title}, ${t("a11y.viewImage")}` : article.title
          }
        >
          <RemoteImage
            source={{ uri: image }}
            style={imageStyle}
            resizeMode="cover"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </Pressable>
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
              hitSlop={12}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={expanded ? t("a11y.showLess") : t("a11y.showMore")}
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
      {mapThumb}
    </>
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
    // Lead image shown alone (page without an infobox).
    soloImage: {
      width: "100%",
      maxWidth: 480,
      maxHeight: 340,
      alignSelf: "center",
      marginTop: 16,
      borderRadius: radii.media,
      backgroundColor: colors.field,
    },
    image: { borderRadius: radii.media, backgroundColor: colors.field, alignSelf: "flex-start" },
    imagePressStacked: { width: "100%", alignItems: "center" },
    imageStacked: {
      width: "100%",
      maxWidth: STACKED_IMAGE_MAX_WIDTH,
      alignSelf: "center",
      borderRadius: radii.media,
      backgroundColor: colors.field,
    },
    // Locator/position map shown under the info card.
    mapBox: {
      marginTop: 10,
      padding: 10,
      borderRadius: radii.media,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.separator,
      alignItems: "center",
    },
    mapImage: {
      width: "100%",
      maxWidth: 280,
      maxHeight: 240,
      borderRadius: radii.media,
      backgroundColor: colors.field,
    },
    mapCaption: { color: colors.muted, fontSize: 12, marginTop: 6, fontStyle: "italic" },
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
