import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AuthScaffold } from "../src/components/AuthScaffold";
import { FormField } from "../src/components/FormField";
import { PrimaryButton } from "../src/components/PrimaryButton";
import { useAuth } from "../src/auth/AuthProvider";
import { useLocale } from "../src/i18n";
import { useTheme, type ThemeColors } from "../src/theme";
import { ApiError } from "../src/api/client";

export default function AccountScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, status, updateProfile, changePassword, wipeData, deleteAccount } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [isPrivate, setIsPrivate] = useState(Boolean(user?.isPrivate));
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | undefined>();

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState<string | undefined>();
  const [pwDone, setPwDone] = useState(false);

  // Guard: account management is for signed-in users only.
  useEffect(() => {
    if (status === "guest") {
      router.replace("/(tabs)/profile");
    }
  }, [status, router]);

  // Keep local fields in sync when the account refreshes.
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setUsername(user.username);
      setIsPrivate(user.isPrivate);
    }
  }, [user]);

  if (!user) {
    return null;
  }

  async function saveProfile() {
    setSavingProfile(true);
    setProfileError(undefined);
    try {
      await updateProfile({ displayName, username });
    } catch (e) {
      setProfileError(e instanceof ApiError ? e.message : t("auth.genericError"));
    } finally {
      setSavingProfile(false);
    }
  }

  async function togglePrivacy(next: boolean) {
    setIsPrivate(next);
    try {
      await updateProfile({ isPrivate: next });
    } catch {
      setIsPrivate(!next); // revert on failure
    }
  }

  async function savePassword() {
    if (!currentPw || !newPw) {
      setPwError(t("auth.fillAllFields"));
      return;
    }
    setSavingPw(true);
    setPwError(undefined);
    setPwDone(false);
    try {
      await changePassword(currentPw, newPw);
      setPwDone(true);
      setCurrentPw("");
      setNewPw("");
    } catch (e) {
      setPwError(e instanceof ApiError ? e.message : t("auth.genericError"));
    } finally {
      setSavingPw(false);
    }
  }

  function confirmWipe() {
    Alert.alert(t("account.wipeConfirmTitle"), t("account.wipeConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("account.wipeData"), style: "destructive", onPress: () => void wipeData() },
    ]);
  }

  function confirmDelete() {
    Alert.alert(t("account.deleteConfirmTitle"), t("account.deleteConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          await deleteAccount();
          router.replace("/(tabs)/profile");
        },
      },
    ]);
  }

  return (
    <AuthScaffold title={t("account.title")}>
      <Text style={styles.sectionLabel}>{t("account.profile")}</Text>
      <FormField
        label={t("auth.displayNameOptional")}
        value={displayName}
        onChangeText={setDisplayName}
        autoCapitalize="words"
      />
      <FormField
        label={t("auth.username")}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        hint={t("auth.usernameHint")}
        error={profileError}
      />
      <PrimaryButton label={t("account.save")} onPress={saveProfile} loading={savingProfile} />

      <View style={styles.toggleRow}>
        <View style={styles.toggleText}>
          <Text style={styles.rowTitle}>{t("account.privateAccount")}</Text>
          <Text style={styles.rowHint}>{t("account.privateHint")}</Text>
        </View>
        <Switch
          value={isPrivate}
          onValueChange={togglePrivacy}
          accessibilityLabel={t("account.privateAccount")}
          accessibilityRole="switch"
          accessibilityState={{ checked: isPrivate }}
          trackColor={{ true: colors.accent, false: colors.separator }}
        />
      </View>

      <Text style={styles.sectionLabel}>{t("account.changePassword")}</Text>
      <FormField
        label={t("account.currentPassword")}
        value={currentPw}
        onChangeText={setCurrentPw}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        showLabel={t("a11y.showPassword")}
        hideLabel={t("a11y.hidePassword")}
      />
      <FormField
        label={t("auth.newPassword")}
        value={newPw}
        onChangeText={setNewPw}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint={t("auth.passwordHint")}
        showLabel={t("a11y.showPassword")}
        hideLabel={t("a11y.hidePassword")}
        error={pwError}
      />
      {pwDone ? (
        <View style={styles.successRow} accessibilityLiveRegion="polite">
          <MaterialIcons name="check-circle" size={16} color={colors.accent} />
          <Text style={styles.successText}>{t("account.saved")}</Text>
        </View>
      ) : null}
      <PrimaryButton label={t("account.save")} onPress={savePassword} loading={savingPw} />

      <Text style={[styles.sectionLabel, styles.dangerLabel]}>{t("account.dangerZone")}</Text>
      <DangerRow
        icon="delete-sweep"
        title={t("account.wipeData")}
        hint={t("account.wipeDataHint")}
        onPress={confirmWipe}
        colors={colors}
        styles={styles}
      />
      <DangerRow
        icon="delete-forever"
        title={t("account.deleteAccount")}
        hint={t("account.deleteAccountHint")}
        onPress={confirmDelete}
        colors={colors}
        styles={styles}
      />
    </AuthScaffold>
  );
}

function DangerRow({
  icon,
  title,
  hint,
  onPress,
  colors,
  styles,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  hint: string;
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.dangerRow}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <MaterialIcons name={icon} size={22} color={colors.danger} />
      <View style={styles.toggleText}>
        <Text style={styles.dangerTitle}>{title}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
    </Pressable>
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
      marginTop: 12,
    },
    dangerLabel: { color: colors.danger },
    toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    toggleText: { flex: 1 },
    rowTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
    rowHint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 },
    successRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    successText: { color: colors.textSecondary, fontSize: 14 },
    dangerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      minHeight: 56,
      paddingVertical: 8,
    },
    dangerTitle: { color: colors.danger, fontSize: 16, fontWeight: "600" },
  });
}
