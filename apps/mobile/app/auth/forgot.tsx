import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AuthScaffold } from "../../src/components/AuthScaffold";
import { FormField } from "../../src/components/FormField";
import { PrimaryButton } from "../../src/components/PrimaryButton";
import { TextLink } from "../../src/components/TextLink";
import { useAuth } from "../../src/auth/AuthProvider";
import { useLocale } from "../../src/i18n";
import { useTheme, type ThemeColors } from "../../src/theme";
import { ApiError } from "../../src/api/client";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | undefined>();

  async function submit() {
    if (!email.trim()) {
      setError(t("auth.fillAllFields"));
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      setSentMessage(await forgotPassword(email.trim()));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("auth.genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      title={t("auth.forgotTitle")}
      subtitle={sentMessage ? undefined : t("auth.forgotSubtitle")}
      footer={
        <TextLink label={t("auth.backToSignIn")} onPress={() => router.replace("/auth/login")} />
      }
    >
      {sentMessage ? (
        <View style={styles.confirm} accessibilityLiveRegion="polite">
          <MaterialIcons name="mark-email-read" size={28} color={colors.accent} />
          <Text style={styles.confirmText}>{sentMessage}</Text>
        </View>
      ) : (
        <>
          <FormField
            label={t("auth.email")}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="go"
            onSubmitEditing={submit}
            error={error}
          />
          <PrimaryButton label={t("auth.sendResetLink")} onPress={submit} loading={loading} />
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
