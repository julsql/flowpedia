import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ConversationSummary } from "@flowpedia/shared";
import { spacing, useTheme, type ThemeColors } from "../../src/theme";
import { ScreenContainer, centeredColumn } from "../../src/components/ScreenContainer";
import { PrimaryButton } from "../../src/components/PrimaryButton";
import { fetchThreads } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthProvider";
import { useNotifications } from "../../src/notifications/NotificationProvider";
import { useLocale } from "../../src/i18n";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ago(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function SharedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useLocale();
  const auth = useAuth();
  const { lastEventAt } = useNotifications();
  const [threads, setThreads] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (auth.status !== "authenticated") {
      setLoading(false);
      return;
    }
    fetchThreads()
      .then((list) => {
        setThreads(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [auth.status]);

  // Reload on mount and live (lastEventAt bumps when a page/follow arrives).
  useEffect(() => {
    load();
  }, [load, lastEventAt]);

  return (
    <ScreenContainer style={{ paddingTop: insets.top + 20 }}>
      <View style={centeredColumn}>
        <Text style={styles.title}>{t("tab.share")}</Text>
      </View>

      {auth.status !== "authenticated" ? (
        <View style={[styles.emptyBox, centeredColumn]}>
          <MaterialIcons name="forum" size={40} color={colors.mutedLight} />
          <Text style={styles.empty}>{t("conversations.signIn")}</Text>
          <PrimaryButton label={t("auth.signIn")} onPress={() => router.push("/auth/login")} />
        </View>
      ) : loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : threads.length === 0 ? (
        <View style={[styles.emptyBox, centeredColumn]}>
          <MaterialIcons name="forum" size={40} color={colors.mutedLight} />
          <Text style={styles.empty}>{t("conversations.empty")}</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.list, centeredColumn]}
        >
          {threads.map((c) => {
            const preview = `${c.mine ? t("conversations.you") : ""}${c.lastTitle ?? c.lastArticleId}`;
            // No unread pill on a conversation whose last message is my own send.
            const showUnread = c.unread > 0 && !c.mine;
            return (
              <Pressable
                key={c.user.id}
                style={styles.row}
                onPress={() => router.push(`/conversation/${c.user.username}`)}
                accessibilityRole="button"
                accessibilityLabel={t("a11y.openConversation", { name: c.user.displayName })}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(c.user.displayName)}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {c.user.displayName}
                  </Text>
                  <Text
                    style={[styles.rowPreview, showUnread && styles.rowPreviewUnread]}
                    numberOfLines={1}
                  >
                    {preview}
                  </Text>
                </View>
                <View style={styles.rowMeta}>
                  <Text style={styles.time}>{ago(c.lastAt)}</Text>
                  {showUnread ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{c.unread > 99 ? "99+" : c.unread}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    title: {
      fontSize: 24,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 16,
      paddingHorizontal: spacing.screenPadding,
    },
    emptyBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingBottom: 80, paddingHorizontal: 32 },
    empty: { color: colors.textSecondary, fontSize: 15, textAlign: "center", maxWidth: 300, lineHeight: 21 },
    list: { paddingBottom: 24, paddingHorizontal: spacing.screenPadding },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, minHeight: 64 },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.field,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: colors.textSecondary, fontSize: 17, fontWeight: "700" },
    rowText: { flex: 1, gap: 2 },
    rowName: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
    rowPreview: { color: colors.textTertiary, fontSize: 13 },
    rowPreviewUnread: { color: colors.textPrimary, fontWeight: "600" },
    rowMeta: { alignItems: "flex-end", gap: 6 },
    time: { color: colors.textTertiary, fontSize: 12 },
    badge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 6,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { color: colors.onAccent, fontSize: 11, fontWeight: "800" },
  });
