import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import type { ReactNode } from "react";
import { useTheme } from "../theme";

// On wide screens (web) the content is constrained to a centered column,
// like Instagram's web feed. On phones it just fills the screen.
export const CONTENT_MAX_WIDTH = 640;

interface ScreenContainerProps {
  children: ReactNode;
  /** Applied to the inner (centered) column. */
  style?: ViewStyle;
}

export function ScreenContainer({ children, style }: ScreenContainerProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.outer, { backgroundColor: colors.bg }]}>
      <View
        style={[
          styles.inner,
          Platform.OS === "web" && { borderColor: colors.separator, ...styles.innerWeb },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: "center" },
  inner: { flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH },
  innerWeb: { borderLeftWidth: 1, borderRightWidth: 1 },
});
