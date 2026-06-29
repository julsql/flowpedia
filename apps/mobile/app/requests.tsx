import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PublicUser } from "@flowpedia/shared";
import { AuthScaffold } from "../src/components/AuthScaffold";
import { UserList } from "../src/components/UserList";
import {
  acceptFollowRequest,
  fetchFollowRequests,
  rejectFollowRequest,
} from "../src/api/client";
import { useLocale } from "../src/i18n";
import { radii, useTheme, type ThemeColors } from "../src/theme";

export default function RequestsScreen() {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchFollowRequests()
      .then((u) => active && (setUsers(u), setLoading(false)))
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const drop = (username: string) => setUsers((prev) => prev.filter((u) => u.username !== username));

  async function accept(username: string) {
    drop(username);
    await acceptFollowRequest(username).catch(() => undefined);
  }
  async function reject(username: string) {
    drop(username);
    await rejectFollowRequest(username).catch(() => undefined);
  }

  return (
    <AuthScaffold title={t("social.requests")}>
      <UserList
        users={users}
        loading={loading}
        emptyText={t("social.noRequests")}
        renderTrailing={(u) => (
          <View style={styles.actions}>
            <Pressable
              onPress={() => accept(u.username)}
              style={[styles.btn, styles.accept]}
              accessibilityRole="button"
              accessibilityLabel={`${t("social.accept")} @${u.username}`}
            >
              <Text style={styles.acceptText}>{t("social.accept")}</Text>
            </Pressable>
            <Pressable
              onPress={() => reject(u.username)}
              style={[styles.btn, styles.reject]}
              accessibilityRole="button"
              accessibilityLabel={`${t("social.reject")} @${u.username}`}
            >
              <Text style={styles.rejectText}>{t("social.reject")}</Text>
            </Pressable>
          </View>
        )}
      />
    </AuthScaffold>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    actions: { flexDirection: "row", gap: 8 },
    btn: {
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    accept: { backgroundColor: colors.accent },
    acceptText: { color: colors.onAccent, fontSize: 14, fontWeight: "700" },
    reject: { borderWidth: 1.5, borderColor: colors.separator },
    rejectText: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },
  });
}
