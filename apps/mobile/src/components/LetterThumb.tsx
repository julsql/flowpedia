import { useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

// The single app-wide cover palette (good contrast with white text in both
// themes). Shared by LetterThumb (small letter fallback) and ArticleCover
// (big-title fallback) so every image-less article looks the same everywhere.
const COLORS = [
  "#8E6FB0",
  "#5A7DAF",
  "#4F9D8C",
  "#C18B5A",
  "#B0586E",
  "#6B7FA0",
  "#9A7B4F",
  "#7E8B5A",
];

/** Stable color derived from a title (the app-wide cover palette).
 *  Shared so a no-image story/cover can fill its whole background with it. */
export function colorForText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return COLORS[hash % COLORS.length];
}

export function firstLetter(text: string): string {
  const ch = text.trim().charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

/** Fallback thumbnail for a page with no image: its first letter on a color
 *  derived from the title (stable per title). White text ≥ 4.5:1 on every swatch. */
export function LetterThumb({
  text,
  style,
  fontSize = 20,
}: {
  text: string;
  style?: StyleProp<ViewStyle>;
  fontSize?: number;
}) {
  const bg = useMemo(() => colorForText(text), [text]);
  return (
    <View
      // Derived color last so a passed `style` backgroundColor can't override it.
      style={[styles.box, style, { backgroundColor: bg }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.letter, { fontSize }]}>{firstLetter(text)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  letter: { color: "#ffffff", fontWeight: "800" },
});
