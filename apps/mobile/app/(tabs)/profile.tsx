import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../../src/theme";
import { LOCALE_LABELS, SUPPORTED_LOCALES, useLocale } from "../../src/i18n";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { t, locale, setLocale } = useLocale();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 20 }]}>
      <Text style={styles.title}>{t("tab.profile")}</Text>
      <Text style={styles.sectionLabel}>{t("settings.language")}</Text>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {SUPPORTED_LOCALES.map((code) => {
          const active = code === locale;
          return (
            <Pressable key={code} onPress={() => setLocale(code)} style={styles.row}>
              <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>
                {LOCALE_LABELS[code]}
              </Text>
              {active ? <MaterialIcons name="check" size={20} color={colors.accent} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
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
    marginBottom: 4,
  },
  list: { paddingBottom: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  rowLabel: { fontSize: 16, color: colors.textSecondary },
  rowLabelActive: { color: colors.textPrimary, fontWeight: "600" },
});
