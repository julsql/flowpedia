import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import type { PublicUser } from "@flowpedia/shared";
import { AuthScaffold } from "../../src/components/AuthScaffold";
import { FormField } from "../../src/components/FormField";
import { searchUsers, sendPage } from "../../src/api/client";
import { useLocale } from "../../src/i18n";
import { radii, useTheme, type ThemeColors } from "../../src/theme";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function SendPageScreen() {
  const params = useLocalSearchParams<{ articleId: string; title?: string; image?: string }>();
  const articleId = decodeURIComponent(String(params.articleId ?? ""));
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const noteRef = useRef(note);
  noteRef.current = note;

  // Debounced user search.
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      searchUsers(term)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  async function send(user: PublicUser) {
    if (sentTo.has(user.username)) {
      return;
    }
    setSentTo((prev) => new Set(prev).add(user.username));
    try {
      await sendPage({
        toUsername: user.username,
        articleId,
        title: params.title ? String(params.title) : undefined,
        image: params.image ? String(params.image) : undefined,
        note: noteRef.current.trim() || undefined,
      });
    } catch {
      // revert on failure so the user can retry
      setSentTo((prev) => {
        const next = new Set(prev);
        next.delete(user.username);
        return next;
      });
    }
  }

  return (
    <AuthScaffold title={t("send.title")} subtitle={params.title ? String(params.title) : undefined}>
      <FormField
        label={t("send.noteLabel")}
        value={note}
        onChangeText={setNote}
        autoCapitalize="sentences"
      />
      <FormField
        label={t("send.searchLabel")}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />
      {searching ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : results.length === 0 ? (
        <Text style={styles.empty}>{t("send.empty")}</Text>
      ) : (
        <View style={styles.list}>
          {results.map((user) => {
            const sent = sentTo.has(user.username);
            return (
              <Pressable
                key={user.id}
                onPress={() => send(user)}
                disabled={sent}
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={t("a11y.sendPageTo", { name: user.displayName })}
                accessibilityState={{ disabled: sent }}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(user.displayName)}</Text>
                </View>
                <View style={styles.names}>
                  <Text style={styles.displayName} numberOfLines={1}>
                    {user.displayName}
                  </Text>
                  <Text style={styles.handle} numberOfLines={1}>
                    @{user.username}
                  </Text>
                </View>
                {sent ? (
                  <View style={[styles.sendBtn, styles.sentBtn]}>
                    <MaterialIcons name="check" size={16} color={colors.accent} />
                    <Text style={styles.sentText}>{t("send.sent")}</Text>
                  </View>
                ) : (
                  <View style={styles.sendBtn}>
                    <MaterialIcons name="send" size={15} color={colors.onAccent} />
                    <Text style={styles.sendText}>{t("send.send")}</Text>
                  </View>
                )}
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
    loader: { marginTop: 24 },
    empty: { color: colors.textTertiary, fontSize: 14, textAlign: "center", marginTop: 24 },
    list: { gap: 4, marginTop: 4 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.field,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: colors.textSecondary, fontSize: 16, fontWeight: "700" },
    names: { flex: 1 },
    displayName: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
    handle: { color: colors.textTertiary, fontSize: 13, marginTop: 1 },
    sendBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      backgroundColor: colors.accent,
    },
    sendText: { color: colors.onAccent, fontSize: 13, fontWeight: "700" },
    sentBtn: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.separator },
    sentText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  });
}
