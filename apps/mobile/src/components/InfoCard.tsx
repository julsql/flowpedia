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
  /**
   * Open the lead/infobox image full-size (lightbox). `marker` (locator maps
   * only) carries the pin's % position + map aspect ratio so the lightbox can
   * redraw the dot over the enlarged map.
   */
  onImagePress?: (
    url: string,
    caption?: string,
    marker?: { top: number; left: number; ratio: number },
  ) => void;
  /** Open an internal link tapped inside an infobox value (the "bounce"). */
  onLinkPress?: (targetId: string) => void;
}

/**
 * Emblematic Wikipedia summary card, restyled as a profile-style header: lead
 * image on the side (aspect ratio kept) + key facts. Falls back to the lead
 * image alone when the page has no infobox.
 */
export function InfoCard({ article, colors, onImagePress, onLinkPress }: InfoCardProps) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useLocale();
  const { width: windowWidth } = useWindowDimensions();
  // Stack the image on top (facts get the full card width) on every phone, and
  // on a narrow web window. Only a wide web window keeps the side-by-side layout.
  const stacked = Platform.OS !== "web" || windowWidth < STACK_BREAKPOINT;
  const [expanded, setExpanded] = useState(false);
  const [mapIdx, setMapIdx] = useState(0);
  const infobox = article.infobox;
  const image = infobox?.image ?? article.image;
  const width = infobox?.image ? infobox.imageWidth : article.imageWidth;
  const height = infobox?.image ? infobox.imageHeight : article.imageHeight;
  const allRows = infobox?.rows ?? [];

  // Locator/position maps (country / region / département…). Switchable; each can
  // carry a pin we redraw at the % coordinates Wikipedia uses. Drop any map that
  // is just the lead image again. Falls back to the singleton fields for older
  // cached articles that predate `infobox.maps`.
  const mapList = (
    infobox?.maps ??
    (infobox?.mapImage
      ? [
          {
            image: infobox.mapImage,
            width: infobox.mapImageWidth,
            height: infobox.mapImageHeight,
            markerTop: infobox.mapMarkerTop,
            markerLeft: infobox.mapMarkerLeft,
            label: undefined as string | undefined,
          },
        ]
      : [])
  ).filter((m) => m.image !== image);
  const selectedMap = mapList.length ? mapList[Math.min(mapIdx, mapList.length - 1)] : undefined;
  const mapLabel = selectedMap?.label ?? t("article.locatorMap");
  const mapRatio =
    selectedMap?.width && selectedMap?.height ? selectedMap.width / selectedMap.height : 1;
  const mapMarker =
    selectedMap?.markerTop !== undefined && selectedMap?.markerLeft !== undefined
      ? {
          top: `${selectedMap.markerTop}%` as const,
          left: `${selectedMap.markerLeft}%` as const,
        }
      : undefined;
  const mapThumb = selectedMap ? (
    <View style={styles.mapBox}>
      <Pressable
        style={styles.mapPress}
        disabled={!onImagePress}
        onPress={() =>
          onImagePress?.(
            selectedMap.image,
            mapLabel,
            mapMarker
              ? { top: selectedMap.markerTop!, left: selectedMap.markerLeft!, ratio: mapRatio }
              : undefined,
          )
        }
        accessibilityRole={onImagePress ? "imagebutton" : "image"}
        accessibilityLabel={onImagePress ? `${mapLabel}, ${t("a11y.viewMap")}` : mapLabel}
      >
        <View style={[styles.mapImageWrap, { aspectRatio: mapRatio }]}>
          <RemoteImage
            source={{ uri: selectedMap.image }}
            style={styles.mapImageFill}
            resizeMode="contain"
          />
          {mapMarker ? (
            <View
              style={[styles.mapPin, mapMarker]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ) : null}
        </View>
      </Pressable>
      {mapList.length > 1 ? (
        <View style={styles.mapTabs}>
          {mapList.map((m, i) => {
            const label = m.label ?? `${i + 1}`;
            const active = i === Math.min(mapIdx, mapList.length - 1);
            return (
              <Pressable
                key={`${m.image}-${i}`}
                onPress={() => setMapIdx(i)}
                style={[styles.mapTab, active && styles.mapTabActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={label}
              >
                <Text
                  style={[styles.mapTabText, active && styles.mapTabTextActive]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.mapCaption}>{mapLabel}</Text>
      )}
    </View>
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
                <Text style={styles.factValue}>
                  {row.valueRuns && onLinkPress
                    ? row.valueRuns.map((run, ri) =>
                        run.linkTargetId ? (
                          <Text
                            key={ri}
                            style={styles.factLink}
                            onPress={() => onLinkPress(run.linkTargetId!)}
                            accessibilityRole="link"
                            accessibilityLabel={run.text}
                          >
                            {run.text}
                          </Text>
                        ) : (
                          run.text
                        ),
                      )
                    : row.value}
                </Text>
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
    // Full width so the child map's "100%" resolves against the card, not a
    // content-hugging Pressable (which would collapse the map to zero width).
    mapPress: { width: "100%", alignItems: "center" },
    // No maxHeight: it would clamp height while width stays, breaking the
    // aspect ratio (and the pin alignment) for tall département maps.
    mapImageWrap: {
      position: "relative",
      width: "100%",
      maxWidth: 280,
      borderRadius: radii.media,
      backgroundColor: colors.field,
      overflow: "hidden",
      alignSelf: "center",
    },
    mapImageFill: { width: "100%", height: "100%" },
    // A pin centered on its % coordinates (the negative margins offset its size).
    mapPin: {
      position: "absolute",
      width: 16,
      height: 16,
      marginTop: -8,
      marginLeft: -8,
      borderRadius: 8,
      backgroundColor: colors.accent,
      borderWidth: 3,
      borderColor: colors.surface,
    },
    mapCaption: { color: colors.muted, fontSize: 12, marginTop: 6, fontStyle: "italic" },
    // Switcher between the available framings (France / region / département…).
    mapTabs: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 6,
      marginTop: 8,
    },
    mapTab: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.field,
      borderWidth: 1,
      borderColor: colors.separator,
      minHeight: 32,
      justifyContent: "center",
    },
    mapTabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    mapTabText: { color: colors.textPrimary, fontSize: 12, fontWeight: "600" },
    mapTabTextActive: { color: colors.surface },
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
    factLink: { color: colors.accent, fontWeight: "600" },
    toggle: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
    toggleText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  });
