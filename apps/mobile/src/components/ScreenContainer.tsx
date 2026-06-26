import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import type { ReactNode } from "react";
import { colors } from "../theme";

// On wide screens (web) the content is constrained to a centered column,
// like Instagram's web feed. On phones it just fills the screen.
export const CONTENT_MAX_WIDTH = 640;

interface ScreenContainerProps {
  children: ReactNode;
  /** Applied to the inner (centered) column. */
  style?: ViewStyle;
}

export function ScreenContainer({ children, style }: ScreenContainerProps) {
  return (
    <View style={styles.outer}>
      <View style={[styles.inner, Platform.OS === "web" && styles.innerWeb, style]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.bg, alignItems: "center" },
  inner: { flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH },
  innerWeb: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.separator,
  },
});
