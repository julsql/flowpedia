import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { StoryGroup } from "@flowpedia/shared";
import { fetchStories } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { useLocale } from "../i18n";
import { useTheme, type ThemeColors } from "../theme";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Instagram-style story bubbles at the top of the home feed. Renders nothing
 *  for guests or when no one you follow has an active (≤24h) story. */
export function StoriesBar() {
  const auth = useAuth();
  const router = useRouter();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [groups, setGroups] = useState<StoryGroup[]>([]);

  useEffect(() => {
    if (!auth.user) {
      setGroups([]);
      return;
    }
    let active = true;
    fetchStories()
      .then((g) => active && setGroups(g))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [auth.user?.id]);

  if (!auth.user || !groups.length) {
    return null;
  }

  return (
    <View style={styles.bar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {groups.map((g) => {
          const isSelf = g.user.id === auth.user!.id;
          return (
            <Pressable
              key={g.user.id}
              style={styles.bubble}
              onPress={() => router.push(`/stories/${g.user.username}`)}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.openStory", { name: g.user.displayName })}
            >
              <View style={styles.ring}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(g.user.displayName)}</Text>
                </View>
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {isSelf ? t("story.yours") : g.user.displayName}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    bar: { borderBottomWidth: 1, borderBottomColor: colors.separator, paddingVertical: 12 },
    row: { paddingHorizontal: 16, gap: 16 },
    bubble: { alignItems: "center", width: 72 },
    ring: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 2,
      borderColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.field,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: colors.textSecondary, fontSize: 20, fontWeight: "700" },
    name: { color: colors.textSecondary, fontSize: 12, marginTop: 5, maxWidth: 72 },
  });
}
