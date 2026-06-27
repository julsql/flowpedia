import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, useTheme, type ThemeColors } from "../../src/theme";
import { ScreenContainer, centeredColumn } from "../../src/components/ScreenContainer";
import { RemoteImage } from "../../src/components/RemoteImage";
import { useLibrary } from "../../src/library/LibraryProvider";
import { shareExternal } from "../../src/share/shareExternal";
import { useLocale } from "../../src/i18n";

export default function SharedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useLocale();
  const { shared } = useLibrary();

  return (
    <ScreenContainer style={{ paddingTop: insets.top + 20 }}>
      <View style={centeredColumn}>
        <Text style={styles.title}>{t("tab.share")}</Text>
      </View>

      {shared.length === 0 ? (
        <View style={[styles.emptyBox, centeredColumn]}>
          <MaterialIcons name="forum" size={40} color={colors.mutedLight} />
          <Text style={styles.empty}>{t("shared.empty")}</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.list, centeredColumn]}
        >
          {shared.map((article) => (
            <Pressable
              key={article.id}
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: "/article/[id]",
                  params: { id: encodeURIComponent(article.id) },
                })
              }
            >
              {article.image ? (
                <RemoteImage source={{ uri: article.image }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.placeholder]} />
              )}
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {article.title}
                </Text>
                <Text style={styles.rowCategory} numberOfLines={1}>
                  {article.category}
                </Text>
              </View>
              {/* Send the article outside the app (OS share sheet → messaging). */}
              <Pressable
                onPress={() => void shareExternal(article)}
                hitSlop={10}
                style={styles.sendBtn}
              >
                <MaterialIcons name="ios-share" size={20} color={colors.accent} />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    title: {
      fontSize: 24,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 16,
      paddingHorizontal: spacing.screenPadding,
    },
    emptyBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingBottom: 80 },
    empty: {
      color: colors.textSecondary,
      fontSize: 15,
      textAlign: "center",
      maxWidth: 260,
      lineHeight: 21,
    },
    list: { paddingBottom: 24, paddingHorizontal: spacing.screenPadding },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
    sendBtn: { padding: 4 },
    thumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: colors.field },
    placeholder: { backgroundColor: colors.separatorThick },
    rowText: { flex: 1 },
    rowTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "500" },
    rowCategory: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
  });
