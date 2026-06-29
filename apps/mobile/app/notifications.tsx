import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { NotificationItem } from "@flowpedia/shared";
import { AuthScaffold } from "../src/components/AuthScaffold";
import { acceptFollowRequest, fetchNotifications, rejectFollowRequest } from "../src/api/client";
import { useNotifications } from "../src/notifications/NotificationProvider";
import { useLocale, type TranslationKey } from "../src/i18n";
import { radii, useTheme, type ThemeColors } from "../src/theme";

const COPY: Record<NotificationItem["type"], TranslationKey> = {
  follow_request: "notif.followRequest",
  follower: "notif.follower",
  follow_accepted: "notif.accepted",
  page_received: "notif.pageReceived",
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Compact relative age, e.g. "now", "5m", "3h", "2d". */
function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { markAllRead } = useNotifications();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchNotifications()
      .then((list) => active && (setItems(list), setLoading(false)))
      .catch(() => active && setLoading(false));
    // Opening the screen clears the unread badge.
    void markAllRead();
    return () => {
      active = false;
    };
  }, [markAllRead]);

  const drop = (id: string) => setItems((prev) => prev.filter((n) => n.id !== id));

  async function accept(n: NotificationItem) {
    if (!n.actor) return;
    drop(n.id);
    await acceptFollowRequest(n.actor.username).catch(() => undefined);
  }
  async function reject(n: NotificationItem) {
    if (!n.actor) return;
    drop(n.id);
    await rejectFollowRequest(n.actor.username).catch(() => undefined);
  }

  function tap(n: NotificationItem) {
    if (n.type === "page_received" && n.articleId) {
      router.push({ pathname: "/article/[id]", params: { id: encodeURIComponent(n.articleId) } });
    } else if (n.actor) {
      router.push(`/u/${n.actor.username}`);
    }
  }

  return (
    <AuthScaffold title={t("notif.title")}>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>{t("notif.empty")}</Text>
      ) : (
        <View style={styles.list}>
          {items.map((n) => {
            const name = n.actor?.displayName ?? t("notif.deletedUser");
            const text = t(COPY[n.type], { name });
            return (
              <Pressable
                key={n.id}
                onPress={() => tap(n)}
                style={[styles.row, !n.read && styles.unreadRow]}
                accessibilityRole="button"
                accessibilityLabel={text}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(name)}</Text>
                </View>
                <View style={styles.body}>
                  <Text style={styles.text} numberOfLines={2}>
                    {text}
                    {n.type === "page_received" && n.title ? (
                      <Text style={styles.title}>{` · ${n.title}`}</Text>
                    ) : null}
                  </Text>
                  <Text style={styles.time}>{ago(n.createdAt)}</Text>
                </View>
                {n.type === "follow_request" && n.actor ? (
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => accept(n)}
                      style={[styles.btn, styles.acceptBtn]}
                      accessibilityRole="button"
                      accessibilityLabel={`${t("social.accept")} @${n.actor.username}`}
                    >
                      <Text style={styles.acceptText}>{t("social.accept")}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => reject(n)}
                      style={[styles.btn, styles.rejectBtn]}
                      accessibilityRole="button"
                      accessibilityLabel={`${t("social.reject")} @${n.actor.username}`}
                    >
                      <Text style={styles.rejectText}>{t("social.reject")}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </AuthScaffold>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loader: { marginTop: 40 },
    empty: { color: colors.textTertiary, fontSize: 15, textAlign: "center", marginTop: 40 },
    list: { gap: 2 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 64,
      paddingVertical: 8,
      paddingHorizontal: 6,
      borderRadius: radii.media,
    },
    unreadRow: { backgroundColor: colors.field },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.field,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: colors.textSecondary, fontSize: 16, fontWeight: "700" },
    body: { flex: 1, gap: 2 },
    text: { color: colors.textPrimary, fontSize: 14, lineHeight: 19 },
    title: { color: colors.textSecondary, fontWeight: "600" },
    time: { color: colors.textTertiary, fontSize: 12 },
    actions: { flexDirection: "row", gap: 8 },
    btn: {
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: radii.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    acceptBtn: { backgroundColor: colors.accent },
    acceptText: { color: colors.onAccent, fontSize: 13, fontWeight: "700" },
    rejectBtn: { borderWidth: 1.5, borderColor: colors.separator },
    rejectText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  });
}
