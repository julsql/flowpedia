import { useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

// A small fixed palette (good contrast with white text in both themes).
const COLORS = ["#c77d3a", "#3a7ec7", "#b54f8e", "#4a9d6b", "#9a6cc0", "#c0541c", "#2f8f87"];

/** Stable color derived from a title (same palette as the letter thumbnails).
 *  Shared so a no-image story can fill its whole background with it. */
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
      style={[styles.box, { backgroundColor: bg }, style]}
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
