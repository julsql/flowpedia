import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing } from "../../src/theme";
import { LOCALES, useLocale } from "../../src/i18n";

const LOCALE_LABELS: Record<string, string> = { en: "English", fr: "Français" };

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { t, locale, setLocale } = useLocale();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 20 }]}>
      <Text style={styles.title}>{t("tab.profile")}</Text>

      <Text style={styles.sectionLabel}>{t("settings.language")}</Text>
      <View style={styles.localeRow}>
        {LOCALES.map((code) => {
          const active = code === locale;
          return (
            <Pressable
              key={code}
              onPress={() => setLocale(code)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {LOCALE_LABELS[code]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.screenPadding },
  title: { fontSize: 24, fontWeight: "600", color: colors.textPrimary, marginBottom: 24 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  localeRow: { flexDirection: "row", gap: 10 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.field,
  },
  chipActive: { backgroundColor: colors.accent },
  chipText: { fontSize: 14, color: colors.textSecondary },
  chipTextActive: { color: colors.bg, fontWeight: "600" },
});
