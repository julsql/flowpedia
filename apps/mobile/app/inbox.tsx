import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { SentPageItem } from "@flowpedia/shared";
import { AuthScaffold } from "../src/components/AuthScaffold";
import { RemoteImage } from "../src/components/RemoteImage";
import { fetchInbox, markPageRead } from "../src/api/client";
import { useLocale } from "../src/i18n";
import { radii, useTheme, type ThemeColors } from "../src/theme";

export default function InboxScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [items, setItems] = useState<SentPageItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchInbox()
      .then((list) => active && (setItems(list), setLoading(false)))
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function open(item: SentPageItem) {
    if (!item.read) {
      setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, read: true } : p)));
      void markPageRead(item.id).catch(() => undefined);
    }
    router.push({ pathname: "/article/[id]", params: { id: encodeURIComponent(item.articleId) } });
  }

  return (
    <AuthScaffold title={t("inbox.title")}>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>{t("inbox.empty")}</Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => open(item)}
              style={[styles.row, !item.read && styles.unreadRow]}
              accessibilityRole="button"
              accessibilityLabel={`${item.title ?? item.articleId} — ${t("inbox.from", {
                name: item.from.displayName,
              })}`}
            >
              {item.image ? (
                <RemoteImage
                  source={{ uri: item.image }}
                  style={styles.thumb}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]} />
              )}
              <View style={styles.body}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title ?? item.articleId}
                </Text>
                <Text style={styles.from}>{t("inbox.from", { name: item.from.displayName })}</Text>
                {item.note ? (
                  <Text style={styles.note} numberOfLines={2}>
                    “{item.note}”
                  </Text>
                ) : null}
              </View>
              {!item.read ? <View style={styles.dot} /> : null}
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
    list: { gap: 2 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 72,
      paddingVertical: 8,
      paddingHorizontal: 6,
      borderRadius: radii.media,
    },
    unreadRow: { backgroundColor: colors.field },
    thumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: colors.field },
    thumbPlaceholder: { backgroundColor: colors.separatorThick },
    body: { flex: 1, gap: 2 },
    title: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
    from: { color: colors.textTertiary, fontSize: 13 },
    note: { color: colors.textSecondary, fontSize: 13, fontStyle: "italic" },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  });
}
