import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Article } from "@flowpedia/shared";
import { RemoteImage } from "./RemoteImage";
import { radii, type ThemeColors } from "../theme";

// Target image width inside the card (the rest is the facts column).
const IMAGE_WIDTH = 132;
const IMAGE_MAX_HEIGHT = 200;

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
  const infobox = article.infobox;
  const image = infobox?.image ?? article.image;
  const width = infobox?.image ? infobox.imageWidth : article.imageWidth;
  const height = infobox?.image ? infobox.imageHeight : article.imageHeight;
  const rows = infobox?.rows ?? [];

  if (!image && rows.length === 0) {
    return null;
  }

  const ratio = width && height ? width / height : undefined;
  const imageHeight = ratio ? Math.min(IMAGE_WIDTH / ratio, IMAGE_MAX_HEIGHT) : 150;

  return (
    <View style={styles.card}>
      {image ? (
        <RemoteImage
          source={{ uri: image }}
          style={[styles.image, { width: IMAGE_WIDTH, height: imageHeight }]}
          resizeMode="cover"
        />
      ) : null}
      {rows.length ? (
        <View style={styles.facts}>
          {rows.map((row, i) =>
            row.heading ? (
              <Text key={i} style={[styles.heading, i > 0 && styles.headingSpaced]}>
                {row.value}
              </Text>
            ) : (
              <View key={i} style={styles.factRow}>
                <Text style={styles.factLabel} numberOfLines={2}>
                  {row.label}
                </Text>
                <Text style={styles.factValue} numberOfLines={3}>
                  {row.value}
                </Text>
              </View>
            ),
          )}
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
    image: { borderRadius: radii.media, backgroundColor: colors.field, alignSelf: "flex-start" },
    facts: { flex: 1, justifyContent: "center", gap: 7 },
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
    factRow: { flexDirection: "row", gap: 8 },
    factLabel: { color: colors.muted, fontSize: 12, width: 92, lineHeight: 17 },
    factValue: { color: colors.textPrimary, fontSize: 13, flex: 1, lineHeight: 17 },
  });
