import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../theme";

/** Temporary stub for screens not built yet (explore, flow, shared). */
export function ScreenPlaceholder({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 20 }]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.screenPadding,
  },
  title: { fontSize: 24, fontWeight: "600", color: colors.textPrimary },
  hint: { fontSize: 15, color: colors.mutedLight, marginTop: 8 },
});
