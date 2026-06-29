import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { PublicUser } from "@flowpedia/shared";
import { useTheme, type ThemeColors } from "../theme";
import { useLocale } from "../i18n";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** A tappable user line (avatar + name + @handle) with an optional trailing action. */
export function UserRow({ user, trailing }: { user: PublicUser; trailing?: ReactNode }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLocale();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.main}
        onPress={() => router.push(`/u/${user.username}`)}
        accessibilityRole="button"
        accessibilityLabel={t("a11y.openProfile", { name: user.displayName })}
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
      </Pressable>
      {trailing}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56 },
    main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
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
  });
}
