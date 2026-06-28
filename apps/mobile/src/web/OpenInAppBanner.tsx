import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { radii, useTheme, type ThemeColors } from "../theme";
import { useLocale } from "../i18n";

const DISMISS_KEY = "flowpedia.appBanner.dismissed";
const SCHEME = "flowpedia";

/** Whether we're on the web build, on a mobile browser (where the app may exist). */
function isWebMobile(): boolean {
  return (
    Platform.OS === "web" &&
    typeof navigator !== "undefined" &&
    /android|iphone|ipad|ipod/i.test(navigator.userAgent)
  );
}

/** Build the app deep link for the current web URL (path + query). */
function deepLinkForCurrentUrl(): string {
  if (typeof window === "undefined") {
    return `${SCHEME}://`;
  }
  const path = window.location.pathname.replace(/^\//, "");
  return `${SCHEME}://${path}${window.location.search}`;
}

/**
 * Web-only banner inviting a mobile-browser visitor to open the current page in
 * the installed Flowpedia app. Dismissible (persisted). Tapping "Open" attempts
 * the app's custom-scheme deep link; if the app isn't installed nothing happens,
 * so it degrades gracefully (no error, no store redirect).
 */
export function OpenInAppBanner() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isWebMobile()) {
      return;
    }
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") {
        return;
      }
    } catch {
      // localStorage may be unavailable (private mode) — show the banner anyway.
    }
    setVisible(true);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore persistence failures
    }
  };

  const openApp = () => {
    const link = deepLinkForCurrentUrl();
    // Navigating to the custom scheme triggers the app if installed.
    window.location.href = link;
    dismiss();
  };

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.banner}>
      <MaterialIcons name="open-in-new" size={22} color={colors.accent} />
      <Text style={styles.text} numberOfLines={2}>
        {t("app.openInApp")}
      </Text>
      <Pressable
        onPress={openApp}
        style={styles.openBtn}
        accessibilityRole="button"
        accessibilityLabel={t("a11y.openInApp")}
      >
        <Text style={styles.openText}>{t("app.open")}</Text>
      </Pressable>
      <Pressable
        onPress={dismiss}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t("a11y.dismiss")}
      >
        <MaterialIcons name="close" size={20} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    banner: {
      position: "absolute",
      left: 12,
      right: 12,
      bottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: radii.media,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.separator,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
      maxWidth: 520,
      alignSelf: "center",
      marginHorizontal: "auto" as unknown as number,
    },
    text: { flex: 1, color: colors.textPrimary, fontSize: 14, lineHeight: 19 },
    openBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radii.pill,
      backgroundColor: colors.accent,
    },
    openText: { color: colors.bg, fontSize: 14, fontWeight: "600" },
  });
