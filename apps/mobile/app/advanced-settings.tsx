import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import type { UpdateProfileRequest } from "@flowpedia/shared";
import { AuthScaffold } from "../src/components/AuthScaffold";
import { Checkbox } from "../src/components/Checkbox";
import { useAuth } from "../src/auth/AuthProvider";
import { LOCALE_LABELS, SUPPORTED_LOCALES, useLocale, type TranslationKey } from "../src/i18n";
import { radii, useTheme, type ThemeColors, type ThemeMode } from "../src/theme";

const THEME_OPTIONS: { mode: ThemeMode; label: TranslationKey }[] = [
  { mode: "system", label: "theme.system" },
  { mode: "light", label: "theme.light" },
  { mode: "dark", label: "theme.dark" },
];

export default function AdvancedSettingsScreen() {
  const { t, locale, setLocale } = useLocale();
  const { colors, mode, setMode, contrast, setContrast } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, updateProfile } = useAuth();

  // Local mirror of the account's preferences (optimistic; reverts on failure).
  const [prefs, setPrefs] = useState({
    isPrivate: Boolean(user?.isPrivate),
    notifyFollows: user?.notifyFollows ?? true,
    notifyMessages: user?.notifyMessages ?? true,
    notifyStories: user?.notifyStories ?? true,
    ttsEnabled: user?.ttsEnabled ?? true,
  });

  useEffect(() => {
    if (user) {
      setPrefs({
        isPrivate: user.isPrivate,
        notifyFollows: user.notifyFollows,
        notifyMessages: user.notifyMessages,
        notifyStories: user.notifyStories,
        ttsEnabled: user.ttsEnabled,
      });
    }
  }, [user]);

  const update = (key: keyof typeof prefs) => async (next: boolean) => {
    setPrefs((prev) => ({ ...prev, [key]: next }));
    try {
      await updateProfile({ [key]: next } as UpdateProfileRequest);
    } catch {
      setPrefs((prev) => ({ ...prev, [key]: !next })); // revert on failure
    }
  };

  return (
    <AuthScaffold title={t("settings.advanced")}>
      {/* Appearance — available to everyone, signed in or not. */}
      <Text style={styles.sectionLabel}>{t("settings.theme")}</Text>
      <View style={styles.segment}>
        {THEME_OPTIONS.map(({ mode: optionMode, label }) => {
          const active = optionMode === mode;
          return (
            <Pressable
              key={optionMode}
              onPress={() => setMode(optionMode)}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t(label)}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {t(label)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>{t("settings.contrast")}</Text>
        <Switch
          value={contrast}
          onValueChange={setContrast}
          accessibilityRole="switch"
          accessibilityLabel={t("settings.contrast")}
          accessibilityState={{ checked: contrast }}
          trackColor={{ true: colors.accent, false: colors.separator }}
        />
      </View>

      <Text style={styles.sectionLabel}>{t("settings.language")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.langRow}>
        {SUPPORTED_LOCALES.map((code) => {
          const active = code === locale;
          return (
            <Pressable
              key={code}
              onPress={() => setLocale(code)}
              style={[styles.langChip, active && styles.langChipActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={LOCALE_LABELS[code]}
            >
              <Text style={[styles.langChipText, active && styles.langChipTextActive]}>
                {LOCALE_LABELS[code]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Account preferences — signed-in only. */}
      {user ? (
        <>
          <Text style={styles.sectionLabel}>{t("settings.notifications")}</Text>
          <Checkbox
            label={t("settings.notifyFollows")}
            hint={t("settings.notifyFollowsHint")}
            value={prefs.notifyFollows}
            onValueChange={update("notifyFollows")}
          />
          <Checkbox
            label={t("settings.notifyMessages")}
            hint={t("settings.notifyMessagesHint")}
            value={prefs.notifyMessages}
            onValueChange={update("notifyMessages")}
          />
          <Checkbox
            label={t("settings.notifyStories")}
            hint={t("settings.notifyStoriesHint")}
            value={prefs.notifyStories}
            onValueChange={update("notifyStories")}
          />

          <Text style={styles.sectionLabel}>{t("settings.reading")}</Text>
          <Checkbox
            label={t("settings.listenButton")}
            hint={t("settings.listenButtonHint")}
            value={prefs.ttsEnabled}
            onValueChange={update("ttsEnabled")}
          />

          <Text style={styles.sectionLabel}>{t("settings.privacy")}</Text>
          <Checkbox
            label={t("account.privateAccount")}
            hint={t("account.privateHint")}
            value={prefs.isPrivate}
            onValueChange={update("isPrivate")}
          />
        </>
      ) : null}
    </AuthScaffold>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    sectionLabel: {
      color: colors.textTertiary,
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginTop: 18,
      marginBottom: 8,
    },
    segment: {
      flexDirection: "row",
      backgroundColor: colors.field,
      borderRadius: radii.pill,
      padding: 4,
      gap: 4,
    },
    segmentItem: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: radii.pill },
    segmentItemActive: { backgroundColor: colors.accent },
    segmentText: { color: colors.textSecondary, fontSize: 14, fontWeight: "500" },
    segmentTextActive: { color: "#fff", fontWeight: "600" },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 14,
      minHeight: 44,
    },
    toggleLabel: { fontSize: 15, color: colors.textPrimary },
    langRow: { gap: 8, paddingRight: 8 },
    langChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radii.pill,
      backgroundColor: colors.field,
    },
    langChipActive: { backgroundColor: colors.accent },
    langChipText: { color: colors.textSecondary, fontSize: 14 },
    langChipTextActive: { color: "#fff", fontWeight: "600" },
  });
}
