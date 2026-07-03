import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { ConversationMessage } from "@flowpedia/shared";
import { AuthScaffold } from "../../src/components/AuthScaffold";
import { RemoteImage } from "../../src/components/RemoteImage";
import { LetterThumb } from "../../src/components/LetterThumb";
import { fetchProfile, fetchThread, sendMessageText } from "../../src/api/client";
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
  const { lastEventAt, refreshMessages } = useNotifications();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [displayName, setDisplayName] = useState(`@${username}`);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    fetchThread(username)
      .then((list) => {
        setMessages(list);
        setLoading(false);
        // Opening/refreshing the thread marks received pages read → update badge.
        void refreshMessages();
      })
      .catch(() => setLoading(false));
  }, [username, refreshMessages]);

  useEffect(() => {
    fetchProfile(username)
      .then((p) => setDisplayName(p.user.displayName))
      .catch(() => undefined);
  }, [username]);

  // Load on mount and live (new page in this thread bumps lastEventAt).
  useEffect(() => {
    load();
  }, [load, lastEventAt]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) {
      return;
    }
    setSending(true);
    try {
      await sendMessageText(username, text);
      setDraft("");
      load();
    } catch {
      // keep the draft so the user can retry
    } finally {
      setSending(false);
    }
  }, [draft, sending, username, load]);

  return (
    <AuthScaffold
      headerContent={
        <Pressable
          onPress={() => router.push(`/u/${username}`)}
          style={styles.profileHeader}
          accessibilityRole="link"
          accessibilityLabel={t("conversation.openProfile")}
        >
          <LetterThumb text={displayName} style={styles.avatar} fontSize={16} />
          <Text style={styles.profileName} numberOfLines={1}>
            {displayName}
          </Text>
        </Pressable>
      }
    >
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : messages.length === 0 ? (
        <Text style={styles.empty}>{t("conversation.empty")}</Text>
      ) : (
        <View style={styles.thread}>
          {messages.map((m) =>
            m.articleId ? (
              // A shared page → tappable card that opens the article.
              <Pressable
                key={m.id}
                onPress={() =>
                  router.push({
                    pathname: "/article/[id]",
                    params: { id: encodeURIComponent(m.articleId as string) },
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
                  <LetterThumb text={m.title ?? m.articleId} style={styles.thumb} />
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
            ) : (
              // A plain text message → simple chat bubble.
              <View
                key={m.id}
                style={[styles.textBubble, m.mine ? styles.mine : styles.theirs]}
              >
                <Text style={[styles.textBody, m.mine && styles.textBodyMine]}>{m.text}</Text>
              </View>
            ),
          )}
        </View>
      )}

      {/* Composer — reply with a plain text message (Instagram-style). */}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={t("conversation.messagePlaceholder")}
          placeholderTextColor={colors.textTertiary}
          multiline
          accessibilityLabel={t("a11y.messageInput")}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim() || sending}
          style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ disabled: !draft.trim() || sending }}
          accessibilityLabel={t("a11y.sendMessage")}
        >
          <MaterialIcons name="send" size={20} color={colors.onAccent} />
        </Pressable>
      </View>
    </AuthScaffold>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    profileHeader: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 44,
    },
    avatar: { width: 36, height: 36, borderRadius: 18 },
    profileName: { flex: 1, color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
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
    // Plain text message bubble.
    textBubble: { maxWidth: "80%", paddingVertical: 9, paddingHorizontal: 13, borderRadius: radii.media },
    textBody: { color: colors.textPrimary, fontSize: 15, lineHeight: 20 },
    textBodyMine: { color: colors.onAccent },
    // Composer row pinned under the thread.
    composer: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      marginTop: 14,
      paddingTop: 8,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      borderRadius: radii.pill,
      backgroundColor: colors.field,
      color: colors.textPrimary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 15,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    sendBtnDisabled: { opacity: 0.5 },
  });
}
