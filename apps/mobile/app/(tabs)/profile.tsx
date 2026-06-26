import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing } from "../../src/theme";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { useLibrary } from "../../src/library/LibraryProvider";
import { LOCALE_LABELS, SUPPORTED_LOCALES, useLocale } from "../../src/i18n";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, locale, setLocale } = useLocale();
  const { saved } = useLibrary();

  return (
    <ScreenContainer
      style={{ paddingTop: insets.top + 20, paddingHorizontal: spacing.screenPadding }}
    >
      <Text style={styles.title}>{t("tab.profile")}</Text>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {saved.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>{t("profile.saved")}</Text>
            {saved.map((article) => (
              <Pressable
                key={article.id}
                style={styles.savedRow}
                onPress={() =>
                  router.push({
                    pathname: "/article/[id]",
                    params: { id: encodeURIComponent(article.id) },
                  })
                }
              >
                {article.image ? (
                  <Image source={{ uri: article.image }} style={styles.savedThumb} />
                ) : (
                  <View style={[styles.savedThumb, styles.savedPlaceholder]} />
                )}
                <View style={styles.savedText}>
                  <Text style={styles.savedTitle} numberOfLines={1}>
                    {article.title}
                  </Text>
                  <Text style={styles.savedCategory} numberOfLines={1}>
                    {article.category}
                  </Text>
                </View>
                <MaterialIcons name="bookmark" size={20} color={colors.accent} />
              </Pressable>
            ))}
          </>
        ) : null}

        <Text style={[styles.sectionLabel, styles.sectionSpacing]}>{t("settings.language")}</Text>
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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "600", color: colors.textPrimary, marginBottom: 24 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  sectionSpacing: { marginTop: 28 },
  list: { paddingBottom: 24 },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  savedThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: colors.field },
  savedPlaceholder: { backgroundColor: colors.separatorThick },
  savedText: { flex: 1 },
  savedTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "500" },
  savedCategory: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
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
