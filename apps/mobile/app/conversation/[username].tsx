import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { ConversationMessage } from "@flowpedia/shared";
import { AuthScaffold } from "../../src/components/AuthScaffold";
import { RemoteImage } from "../../src/components/RemoteImage";
import { fetchProfile, fetchThread } from "../../src/api/client";
import { useNotifications } from "../../src/notifications/NotificationProvider";
import { useLocale } from "../../src/i18n";
import { radii, useTheme, type ThemeColors } from "../../src/theme";

export default function ConversationScreen() {
  const params = useLocalSearchParams<{ username: string }>();
  const username = String(params.username ?? "");
  const router = useRouter();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { lastEventAt, refresh } = useNotifications();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [displayName, setDisplayName] = useState(`@${username}`);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetchThread(username)
      .then((list) => {
        setMessages(list);
        setLoading(false);
        // Opening/refreshing the thread marks received pages read server-side.
        void refresh();
      })
      .catch(() => setLoading(false));
  }, [username, refresh]);

  useEffect(() => {
    fetchProfile(username)
      .then((p) => setDisplayName(p.user.displayName))
      .catch(() => undefined);
  }, [username]);

  // Load on mount and live (new page in this thread bumps lastEventAt).
  useEffect(() => {
    load();
  }, [load, lastEventAt]);

  return (
    <AuthScaffold title={displayName}>
      <Pressable
        onPress={() => router.push(`/u/${username}`)}
        style={styles.profileLink}
        accessibilityRole="link"
        accessibilityLabel={t("conversation.openProfile")}
      >
        <Text style={styles.profileLinkText}>{t("conversation.openProfile")}</Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : messages.length === 0 ? (
        <Text style={styles.empty}>{t("conversation.empty")}</Text>
      ) : (
        <View style={styles.thread}>
          {messages.map((m) => (
            <Pressable
              key={m.id}
              onPress={() =>
                router.push({
                  pathname: "/article/[id]",
                  params: { id: encodeURIComponent(m.articleId) },
                })
              }
              style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}
              accessibilityRole="button"
              accessibilityLabel={m.title ?? m.articleId}
            >
              {m.image ? (
                <RemoteImage
                  source={{ uri: m.image }}
                  style={styles.thumb}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              ) : (
                <View style={[styles.thumb, styles.placeholder]} />
              )}
              <View style={styles.bubbleText}>
                <Text
                  style={[styles.cardTitle, m.mine && styles.cardTitleMine]}
                  numberOfLines={2}
                >
                  {m.title ?? m.articleId}
                </Text>
                {m.note ? (
                  <Text style={[styles.note, m.mine && styles.noteMine]} numberOfLines={3}>
                    {m.note}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </AuthScaffold>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    profileLink: { alignSelf: "flex-start", marginBottom: 8 },
    profileLinkText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
    empty: { color: colors.textTertiary, fontSize: 15, textAlign: "center", marginTop: 40 },
    thread: { gap: 10 },
    bubble: {
      flexDirection: "row",
      gap: 10,
      maxWidth: "88%",
      padding: 8,
      borderRadius: radii.media,
    },
    mine: { alignSelf: "flex-end", backgroundColor: colors.accent },
    theirs: { alignSelf: "flex-start", backgroundColor: colors.field },
    thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: colors.separatorThick },
    placeholder: { backgroundColor: colors.separatorThick },
    bubbleText: { flex: 1, justifyContent: "center" },
    cardTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
    cardTitleMine: { color: colors.onAccent },
    note: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
    noteMine: { color: colors.onAccent, opacity: 0.9 },
  });
}
