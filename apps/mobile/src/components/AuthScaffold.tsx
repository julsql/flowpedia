import { useMemo, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, type ThemeColors } from "../theme";
import { ScreenContainer, centeredColumn } from "./ScreenContainer";
import { useLocale } from "../i18n";

interface AuthScaffoldProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Footer area (secondary links). */
  footer?: ReactNode;
}

/** Shared chrome for the auth screens: back button, title/subtitle, keyboard-safe
 *  scroll. Keeps every form visually and a11y-consistent. */
export function AuthScaffold({ title, subtitle, children, footer }: AuthScaffoldProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLocale();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <ScreenContainer style={{ paddingTop: insets.top + 8 }}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.goBack")}
          style={styles.backBtn}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, centeredColumn]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.form}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    header: { height: 44, justifyContent: "center" },
    backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    scroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 8 },
    title: { color: colors.textPrimary, fontSize: 26, fontWeight: "800", marginTop: 8 },
    subtitle: { color: colors.textSecondary, fontSize: 15, lineHeight: 21, marginBottom: 8 },
    form: { gap: 16, marginTop: 12 },
    footer: { marginTop: 22, gap: 14, alignItems: "center" },
  });
}
