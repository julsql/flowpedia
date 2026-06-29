import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import type { FollowState } from "@flowpedia/shared";
import { followUser, unfollowUser } from "../api/client";
import { radii, useTheme, type ThemeColors } from "../theme";
import { useLocale } from "../i18n";

/** Follow / Requested / Following toggle for a given account. */
export function FollowButton({
  username,
  state,
  onChange,
  compact = false,
}: {
  username: string;
  state: FollowState;
  onChange: (next: FollowState) => void;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useLocale();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [busy, setBusy] = useState(false);

  const isFollowing = state !== "none";
  const label =
    state === "active"
      ? t("social.followingState")
      : state === "pending"
        ? t("social.requested")
        : t("social.follow");

  async function toggle() {
    setBusy(true);
    try {
      const res = isFollowing ? await unfollowUser(username) : await followUser(username);
      onChange(res.state);
    } catch {
      // keep current state on failure
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      onPress={toggle}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, selected: isFollowing }}
      style={[
        styles.btn,
        compact && styles.compact,
        isFollowing ? styles.outline : styles.filled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={isFollowing ? colors.accent : colors.onAccent} />
      ) : (
        <Text style={[styles.label, isFollowing ? styles.outlineLabel : styles.filledLabel]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    btn: {
      minHeight: 44,
      minWidth: 112,
      paddingHorizontal: 18,
      borderRadius: radii.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    compact: { minWidth: 96, minHeight: 40, paddingHorizontal: 14 },
    filled: { backgroundColor: colors.accent },
    outline: { borderWidth: 1.5, borderColor: colors.accent },
    label: { fontSize: 15, fontWeight: "700" },
    filledLabel: { color: colors.onAccent },
    outlineLabel: { color: colors.accent },
  });
}
