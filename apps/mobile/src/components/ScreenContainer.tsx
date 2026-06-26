import { StyleSheet, View, type ViewStyle } from "react-native";
import type { ReactNode } from "react";
import { useTheme } from "../theme";

// Kept for screens (e.g. the immersive Flow) that still want a comfortable
// reading column. The standard screens now go full-bleed on web so the whole
// window scrolls (no side frames, scrollable right to the edges).
export const CONTENT_MAX_WIDTH = 640;

interface ScreenContainerProps {
  children: ReactNode;
  style?: ViewStyle;
}

export function ScreenContainer({ children, style }: ScreenContainerProps) {
  const { colors } = useTheme();
  return <View style={[styles.outer, { backgroundColor: colors.bg }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  outer: { flex: 1, width: "100%" },
});
