import { useState } from "react";
import { useRouter } from "expo-router";
import { AuthScaffold } from "../../src/components/AuthScaffold";
import { FormField } from "../../src/components/FormField";
import { PrimaryButton } from "../../src/components/PrimaryButton";
import { TextLink } from "../../src/components/TextLink";
import { useAuth } from "../../src/auth/AuthProvider";
import { useLocale } from "../../src/i18n";
import { ApiError } from "../../src/api/client";

export default function RegisterScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim() || !username.trim() || !password) {
      setError(t("auth.fillAllFields"));
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      await register({
        email: email.trim(),
        username: username.trim(),
        password,
        displayName: displayName.trim() || undefined,
      });
      router.replace("/(tabs)/profile");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("auth.genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      title={t("auth.registerTitle")}
      subtitle={t("auth.registerSubtitle")}
      footer={
        <TextLink
          prefix={t("auth.haveAccount")}
          label={t("auth.signIn")}
          onPress={() => router.replace("/auth/login")}
        />
      }
    >
      <FormField
        label={t("auth.email")}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <FormField
        label={t("auth.username")}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoComplete="username-new"
        hint={t("auth.usernameHint")}
        returnKeyType="next"
      />
      <FormField
        label={t("auth.displayNameOptional")}
        value={displayName}
        onChangeText={setDisplayName}
        autoCapitalize="words"
        returnKeyType="next"
      />
      <FormField
        label={t("auth.password")}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password-new"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
        hint={t("auth.passwordHint")}
        showLabel={t("a11y.showPassword")}
        hideLabel={t("a11y.hidePassword")}
        error={error}
      />
      <PrimaryButton label={t("auth.createAccount")} onPress={submit} loading={loading} />
    </AuthScaffold>
  );
}
