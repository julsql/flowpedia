import { useState } from "react";
import { useRouter } from "expo-router";
import { AuthScaffold } from "../../src/components/AuthScaffold";
import { FormField } from "../../src/components/FormField";
import { PrimaryButton } from "../../src/components/PrimaryButton";
import { TextLink } from "../../src/components/TextLink";
import { useAuth } from "../../src/auth/AuthProvider";
import { useLocale } from "../../src/i18n";
import { ApiError } from "../../src/api/client";

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!identifier.trim() || !password) {
      setError(t("auth.fillAllFields"));
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      await login({ identifier: identifier.trim(), password });
      router.replace("/(tabs)/profile");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("auth.genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      title={t("auth.loginTitle")}
      subtitle={t("auth.loginSubtitle")}
      footer={
        <>
          <TextLink label={t("auth.forgotPassword")} onPress={() => router.push("/auth/forgot")} />
          <TextLink
            prefix={t("auth.noAccount")}
            label={t("auth.createAccount")}
            onPress={() => router.replace("/auth/register")}
          />
        </>
      }
    >
      <FormField
        label={t("auth.identifier")}
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        autoComplete="username"
        textContentType="username"
        returnKeyType="next"
      />
      <FormField
        label={t("auth.password")}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        showLabel={t("a11y.showPassword")}
        hideLabel={t("a11y.hidePassword")}
        error={error}
      />
      <PrimaryButton label={t("auth.signIn")} onPress={submit} loading={loading} />
    </AuthScaffold>
  );
}
