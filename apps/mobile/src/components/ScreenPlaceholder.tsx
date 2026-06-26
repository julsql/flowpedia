import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../theme";
import { ScreenContainer } from "./ScreenContainer";

/** Temporary stub for screens not built yet (explore, flow, shared). */
export function ScreenPlaceholder({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  return (
    <ScreenContainer style={{ paddingTop: insets.top + 20, paddingHorizontal: spacing.screenPadding }}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>Coming soon</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "600", color: colors.textPrimary },
  hint: { fontSize: 15, color: colors.mutedLight, marginTop: 8 },
});
