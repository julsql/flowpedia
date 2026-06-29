import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AuthScaffold } from "../../../src/components/AuthScaffold";
import { FormField } from "../../../src/components/FormField";
import { PrimaryButton } from "../../../src/components/PrimaryButton";
import { TextLink } from "../../../src/components/TextLink";
import { useAuth } from "../../../src/auth/AuthProvider";
import { useLocale } from "../../../src/i18n";
import { useTheme, type ThemeColors } from "../../../src/theme";
import { ApiError } from "../../../src/api/client";

/** Reached from the password-reset email link: /reset/<uid>/<token>. */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { resetPassword } = useAuth();
  const params = useLocalSearchParams<{ uid?: string; token?: string }>();
  const uid = String(params.uid ?? "");
  const token = String(params.token ?? "");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | undefined>();

  async function submit() {
    if (!password || !confirm) {
      setError(t("auth.fillAllFields"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.passwordsMismatch"));
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      setDoneMessage(await resetPassword({ uid, token, newPassword: password }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("auth.genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      title={t("auth.resetTitle")}
      subtitle={doneMessage ? undefined : t("auth.resetSubtitle")}
      footer={
        <TextLink label={t("auth.backToSignIn")} onPress={() => router.replace("/auth/login")} />
      }
    >
      {doneMessage ? (
        <View style={styles.confirm} accessibilityLiveRegion="polite">
          <MaterialIcons name="check-circle" size={28} color={colors.accent} />
          <Text style={styles.confirmText}>{doneMessage}</Text>
        </View>
      ) : (
        <>
          <FormField
            label={t("auth.newPassword")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            hint={t("auth.passwordHint")}
            showLabel={t("a11y.showPassword")}
            hideLabel={t("a11y.hidePassword")}
          />
          <FormField
            label={t("auth.confirmPassword")}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={submit}
            showLabel={t("a11y.showPassword")}
            hideLabel={t("a11y.hidePassword")}
            error={error}
          />
          <PrimaryButton label={t("auth.updatePassword")} onPress={submit} loading={loading} />
        </>
      )}
    </AuthScaffold>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    confirm: { alignItems: "center", gap: 12, paddingVertical: 12 },
    confirmText: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: "center" },
  });
}
