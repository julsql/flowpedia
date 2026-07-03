import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AuthScaffold } from "../../../src/components/AuthScaffold";
import { TextLink } from "../../../src/components/TextLink";
import { useAuth } from "../../../src/auth/AuthProvider";
import { useLocale } from "../../../src/i18n";
import { useTheme, type ThemeColors } from "../../../src/theme";

/** Reached from the email-change confirmation link: /confirm-email/<uid>/<token>. */
export default function ConfirmEmailScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { confirmEmailChange } = useAuth();
  const params = useLocalSearchParams<{ uid?: string; token?: string }>();
  const uid = String(params.uid ?? "");
  const token = String(params.token ?? "");

  const [state, setState] = useState<"loading" | "done" | "error">("loading");

  // Confirm exactly once: the token is single-use, so confirming updates the
  // account, which changes the auth context (and thus confirmEmailChange's
  // identity). Without this guard the effect would re-run and call confirm again
  // with the now-consumed token — showing a false "invalid link" error.
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) {
      return;
    }
    ran.current = true;
    confirmEmailChange(uid, token)
      .then(() => setState("done"))
      .catch(() => setState("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthScaffold
      title={t("account.confirmEmailTitle")}
      footer={
        <TextLink
          label={t("account.backToProfile")}
          onPress={() => router.replace("/(tabs)/profile")}
        />
      }
    >
      <View style={styles.box} accessibilityLiveRegion="polite">
        {state === "loading" ? (
          <ActivityIndicator color={colors.accent} />
        ) : state === "done" ? (
          <>
            <MaterialIcons name="check-circle" size={28} color={colors.accent} />
            <Text style={styles.text}>{t("account.emailConfirmed")}</Text>
          </>
        ) : (
          <>
            <MaterialIcons name="error-outline" size={28} color={colors.danger} />
            <Text style={styles.text}>{t("account.emailConfirmError")}</Text>
          </>
        )}
      </View>
    </AuthScaffold>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    box: { alignItems: "center", gap: 12, paddingVertical: 24 },
    text: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: "center" },
  });
}
