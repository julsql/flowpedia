import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme, type ThemeColors } from "../theme";
import { useLocale } from "../i18n";
import { useAuth } from "../auth/AuthProvider";
import { useNotifications } from "../notifications/NotificationProvider";

/** Header bell that opens the notifications screen and shows an unread badge.
 *  Hidden in guest mode (notifications are per-account). */
export function NotificationBell() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLocale();
  const auth = useAuth();
  const { unread } = useNotifications();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (auth.status !== "authenticated") {
    return null;
  }

  const label =
    unread > 0 ? t("a11y.notifications", { count: unread }) : t("notif.title");

  return (
    <Pressable
      onPress={() => router.push("/notifications")}
      hitSlop={12}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialIcons name="notifications-none" size={26} color={colors.textPrimary} />
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} numberOfLines={1}>
            {unread > 99 ? "99+" : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    btn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    badge: {
      position: "absolute",
      top: 4,
      right: 4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: colors.danger,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { color: "#ffffff", fontSize: 11, fontWeight: "800" },
  });
}
