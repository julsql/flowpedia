import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { StoryGroup } from "@flowpedia/shared";
import { AuthScaffold } from "../../src/components/AuthScaffold";
import { RemoteImage } from "../../src/components/RemoteImage";
import { fetchStories } from "../../src/api/client";
import { useLocale } from "../../src/i18n";
import { useTheme, type ThemeColors } from "../../src/theme";

export default function StoryViewerScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ username?: string }>();
  const username = String(params.username ?? "");

  const [group, setGroup] = useState<StoryGroup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchStories()
      .then((groups) => {
        if (!active) return;
        setGroup(groups.find((g) => g.user.username === username) ?? null);
        setLoading(false);
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [username]);

  const openArticle = (id: string) =>
    router.push({ pathname: "/article/[id]", params: { id: encodeURIComponent(id) } });

  return (
    <AuthScaffold title={group ? group.user.displayName : `@${username}`}>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : !group || !group.items.length ? (
        <Text style={styles.empty}>{t("story.empty")}</Text>
      ) : (
        <View style={styles.list}>
          {group.items.map((item) => (
            <Pressable
              key={item.id}
              style={styles.card}
              onPress={() => openArticle(item.articleId)}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.openStoryArticle", { title: item.title ?? item.articleId })}
            >
              {item.image ? (
                <RemoteImage source={{ uri: item.image }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.placeholder]} />
              )}
              <Text style={styles.title} numberOfLines={2}>
                {item.title ?? item.articleId}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </AuthScaffold>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loader: { marginTop: 40 },
    empty: { color: colors.textTertiary, fontSize: 15, textAlign: "center", marginTop: 40 },
    list: { gap: 12 },
    card: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64 },
    thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: colors.field },
    placeholder: { backgroundColor: colors.separatorThick },
    title: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  });
}
