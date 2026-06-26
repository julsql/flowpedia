import { StyleSheet, View, type ViewStyle } from "react-native";
import type { ReactNode } from "react";
import { useTheme } from "../theme";

// Content sits in a centered column (comfortable reading width). The scroll
// surface itself stays full-width, so the black side areas scroll too — apply
// `centeredColumn` to a screen's scroll contentContainerStyle and to its header
// rows. On a phone (< maxWidth) it's a no-op.
export const CONTENT_MAX_WIDTH = 640;

export const centeredColumn: ViewStyle = {
  width: "100%",
  maxWidth: CONTENT_MAX_WIDTH,
  marginHorizontal: "auto",
};

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
