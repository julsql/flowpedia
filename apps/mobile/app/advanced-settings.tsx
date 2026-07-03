import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import type { UpdateProfileRequest } from "@flowpedia/shared";
import { AuthScaffold } from "../src/components/AuthScaffold";
import { Checkbox } from "../src/components/Checkbox";
import { useAuth } from "../src/auth/AuthProvider";
import { useLocale } from "../src/i18n";
import { useTheme, type ThemeColors } from "../src/theme";

export default function AdvancedSettingsScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, status, updateProfile } = useAuth();

  // Local mirror of the account's preferences (optimistic; reverts on failure).
  const [prefs, setPrefs] = useState({
    isPrivate: Boolean(user?.isPrivate),
    notifyFollows: user?.notifyFollows ?? true,
    notifyMessages: user?.notifyMessages ?? true,
    notifyStories: user?.notifyStories ?? true,
    ttsEnabled: user?.ttsEnabled ?? true,
  });

  // Account settings are for signed-in users only.
  useEffect(() => {
    if (status === "guest") {
      router.replace("/(tabs)/profile");
    }
  }, [status, router]);

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

  if (!user) {
    return null;
  }

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
      marginBottom: 4,
    },
  });
}
