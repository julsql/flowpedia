import { useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colorForText } from "./LetterThumb";

/** Fallback cover for an article with no image: its title shown big on a color
 *  derived from the title (stable per title, app-wide palette shared with
 *  LetterThumb). Use this everywhere a missing article image would otherwise
 *  leave a blank/grey box — larger surfaces (cards, tiles, full-screen). For
 *  small thumbnails (history, avatars, previews) use LetterThumb instead.
 *  White text ≥ 4.5:1 on every swatch. */
export function ArticleCover({
  title,
  style,
  fontSize = 28,
  numberOfLines = 4,
}: {
  title: string;
  style?: StyleProp<ViewStyle>;
  fontSize?: number;
  numberOfLines?: number;
}) {
  const bg = useMemo(() => colorForText(title), [title]);
  return (
    <View
      style={[styles.cover, { backgroundColor: bg }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text
        style={[styles.title, { fontSize, lineHeight: Math.round(fontSize * 1.2) }]}
        numberOfLines={numberOfLines}
      >
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { alignItems: "center", justifyContent: "center", padding: 20, overflow: "hidden" },
  title: { color: "#ffffff", fontWeight: "800", textAlign: "center" },
});
