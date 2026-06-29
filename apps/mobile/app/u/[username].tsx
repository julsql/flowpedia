import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { FollowState, ProfileView } from "@flowpedia/shared";
import { AuthScaffold } from "../../src/components/AuthScaffold";
import { FollowButton } from "../../src/components/FollowButton";
import { fetchProfile } from "../../src/api/client";
import { useLocale } from "../../src/i18n";
import { useTheme, type ThemeColors } from "../../src/theme";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function UserProfileScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ username?: string }>();
  const username = String(params.username ?? "");

  const [view, setView] = useState<ProfileView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchProfile(username)
      .then((v) => active && (setView(v), setLoading(false)))
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [username]);

  function onFollowChange(next: FollowState) {
    setView((prev) => {
      if (!prev) return prev;
      const delta = next === "active" ? 1 : prev.state === "active" ? -1 : 0;
      return { ...prev, state: next, followers: Math.max(0, prev.followers + delta) };
    });
  }

  return (
    <AuthScaffold title={view ? `@${view.user.username}` : ""}>
      {loading || !view ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : (
        <>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(view.user.displayName)}</Text>
            </View>
            <Text style={styles.name}>{view.user.displayName}</Text>
            {view.followsYou ? (
              <Text style={styles.followsYou}>{t("social.followsYou")}</Text>
            ) : null}
          </View>

          <View style={styles.counts}>
            <CountItem
              value={view.followers}
              label={t("social.followers")}
              onPress={() => router.push(`/u/${view.user.username}/followers`)}
              styles={styles}
            />
            <View style={styles.countDivider} />
            <CountItem
              value={view.following}
              label={t("social.following")}
              onPress={() => router.push(`/u/${view.user.username}/following`)}
              styles={styles}
            />
          </View>

          {!view.isSelf ? (
            <View style={styles.actions}>
              <FollowButton username={view.user.username} state={view.state} onChange={onFollowChange} />
            </View>
          ) : null}

          {!view.canViewContent ? (
            <View style={styles.lock}>
              <MaterialIcons name="lock-outline" size={26} color={colors.textTertiary} />
              <Text style={styles.lockTitle}>{t("social.private")}</Text>
              <Text style={styles.lockHint}>{t("social.privateHint")}</Text>
            </View>
          ) : null}
        </>
      )}
    </AuthScaffold>
  );
}

function CountItem({
  value,
  label,
  onPress,
  styles,
}: {
  value: number;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable
      style={styles.count}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
    >
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loader: { marginTop: 40 },
    identity: { alignItems: "center", gap: 8 },
    avatar: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: colors.field,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: colors.textSecondary, fontSize: 30, fontWeight: "700" },
    name: { color: colors.textPrimary, fontSize: 20, fontWeight: "700", marginTop: 4 },
    followsYou: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "600",
      backgroundColor: colors.field,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      overflow: "hidden",
    },
    counts: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 20,
    },
    count: { alignItems: "center", paddingHorizontal: 28, minHeight: 44, justifyContent: "center" },
    countValue: { color: colors.textPrimary, fontSize: 19, fontWeight: "800" },
    countLabel: { color: colors.textTertiary, fontSize: 13, marginTop: 2 },
    countDivider: { width: 1, height: 30, backgroundColor: colors.separator },
    actions: { alignItems: "center", marginTop: 22 },
    lock: { alignItems: "center", gap: 8, marginTop: 36, paddingHorizontal: 20 },
    lockTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
    lockHint: { color: colors.textSecondary, fontSize: 14, textAlign: "center", lineHeight: 20 },
  });
}
