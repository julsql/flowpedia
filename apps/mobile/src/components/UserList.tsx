import { useMemo, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { PublicUser } from "@flowpedia/shared";
import { useTheme, type ThemeColors } from "../theme";
import { UserRow } from "./UserRow";

/** Renders a list of users with loading and empty states. */
export function UserList({
  users,
  loading,
  emptyText,
  renderTrailing,
}: {
  users: PublicUser[];
  loading: boolean;
  emptyText: string;
  renderTrailing?: (user: PublicUser) => ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (loading) {
    return <ActivityIndicator color={colors.accent} style={styles.loader} />;
  }
  if (!users.length) {
    return <Text style={styles.empty}>{emptyText}</Text>;
  }
  return (
    <View style={styles.list}>
      {users.map((u) => (
        <UserRow key={u.id} user={u} trailing={renderTrailing?.(u)} />
      ))}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loader: { marginTop: 40 },
    list: { gap: 4 },
    empty: { color: colors.textTertiary, fontSize: 15, textAlign: "center", marginTop: 40 },
  });
}
