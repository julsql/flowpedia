import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Article } from "@flowpedia/shared";
import { radii, spacing, useTheme, type ThemeColors, type ThemeMode } from "../../src/theme";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { useLibrary } from "../../src/library/LibraryProvider";
import { useUser } from "../../src/user/UserProvider";
import { LOCALE_LABELS, SUPPORTED_LOCALES, useLocale, type TranslationKey } from "../../src/i18n";

const THEME_OPTIONS: { mode: ThemeMode; label: TranslationKey }[] = [
  { mode: "system", label: "theme.system" },
  { mode: "light", label: "theme.light" },
  { mode: "dark", label: "theme.dark" },
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Top distinct categories across the user's activity → interest chips. */
function deriveInterests(articles: Article[]): string[] {
  const counts = new Map<string, number>();
  for (const a of articles) {
    const c = a.category?.trim();
    if (c && c.toLowerCase() !== "wikipedia") {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, locale, setLocale } = useLocale();
  const user = useUser();
  const { read, liked, saved, mutedInterests, muteInterest } = useLibrary();

  // Which list (liked / saved) is expanded under the stats, if any.
  const [openList, setOpenList] = useState<"liked" | "saved" | null>(null);

  const interests = useMemo(() => {
    const muted = new Set(mutedInterests);
    return deriveInterests([...read, ...liked, ...saved]).filter((i) => !muted.has(i));
  }, [read, liked, saved, mutedInterests]);

  const openArticle = (id: string) =>
    router.push({ pathname: "/article/[id]", params: { id: encodeURIComponent(id) } });

  const listArticles = openList === "liked" ? liked : openList === "saved" ? saved : [];

  return (
    <ScreenContainer style={{ paddingTop: insets.top + 16 }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Identity */}
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(user.name)}</Text>
          </View>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.bio}>{t("profile.bio")}</Text>
        </View>

        {/* Stats — Liked / Saved are tappable to reveal their pages. */}
        <View style={styles.stats}>
          <Stat styles={styles} value={read.length} label={t("profile.read")} />
          <View style={styles.statDivider} />
          <Stat
            styles={styles}
            colors={colors}
            value={liked.length}
            label={t("profile.liked")}
            icon="favorite"
            active={openList === "liked"}
            onPress={() => setOpenList((v) => (v === "liked" ? null : "liked"))}
          />
          <View style={styles.statDivider} />
          <Stat
            styles={styles}
            colors={colors}
            value={saved.length}
            label={t("profile.saved")}
            icon="bookmark"
            active={openList === "saved"}
            onPress={() => setOpenList((v) => (v === "saved" ? null : "saved"))}
          />
        </View>

        {/* Liked / saved list (toggled from the stats above). */}
        {openList ? (
          <View style={styles.section}>
            {listArticles.length === 0 ? (
              <Text style={styles.emptyList}>{t("profile.emptyList")}</Text>
            ) : (
              <View style={styles.savedGrid}>
                {listArticles.map((article) => (
                  <Pressable
                    key={article.id}
                    style={styles.savedCell}
                    onPress={() => openArticle(article.id)}
                  >
                    {article.image ? (
                      <Image source={{ uri: article.image }} style={styles.savedImage} />
                    ) : (
                      <View style={[styles.savedImage, styles.savedPlaceholder]} />
                    )}
                    <Text style={styles.savedCaption} numberOfLines={2}>
                      {article.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {/* Interests — removable chips steer the recommendation algorithm. */}
        {interests.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t("profile.interests")}</Text>
            <View style={styles.chips}>
              {interests.map((interest) => (
                <Pressable
                  key={interest}
                  style={styles.interestChip}
                  onPress={() => muteInterest(interest)}
                  hitSlop={6}
                >
                  <Text style={styles.interestChipText}>{interest}</Text>
                  <MaterialIcons name="close" size={15} color={colors.interestChipText} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Settings — compact */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("settings.theme")}</Text>
          <View style={styles.segment}>
            {THEME_OPTIONS.map(({ mode: optionMode, label }) => {
              const active = optionMode === mode;
              return (
                <Pressable
                  key={optionMode}
                  onPress={() => setMode(optionMode)}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {t(label)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("settings.language")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.langRow}
          >
            {SUPPORTED_LOCALES.map((code) => {
              const active = code === locale;
              return (
                <Pressable
                  key={code}
                  onPress={() => setLocale(code)}
                  style={[styles.langChip, active && styles.langChipActive]}
                >
                  <Text style={[styles.langChipText, active && styles.langChipTextActive]}>
                    {LOCALE_LABELS[code]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function Stat({
  value,
  label,
  styles,
  colors,
  icon,
  active,
  onPress,
}: {
  value: number;
  label: string;
  styles: ReturnType<typeof makeStyles>;
  colors?: ThemeColors;
  icon?: "favorite" | "bookmark";
  active?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={styles.statValueRow}>
        {icon ? (
          <MaterialIcons
            name={icon}
            size={16}
            color={active ? colors?.accent : colors?.textPrimary}
          />
        ) : null}
        <Text style={[styles.statValue, active && colors ? { color: colors.accent } : null]}>
          {value}
        </Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );
  if (onPress) {
    return (
      <Pressable style={styles.stat} onPress={onPress}>
        {content}
      </Pressable>
    );
  }
  return <View style={styles.stat}>{content}</View>;
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scroll: { paddingHorizontal: spacing.screenPadding, paddingBottom: 32 },
    identity: { alignItems: "center", marginBottom: 24 },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: "#fff", fontSize: 26, fontWeight: "700" },
    name: { color: colors.textPrimary, fontSize: 20, fontWeight: "600", marginTop: 12 },
    bio: { color: colors.textTertiary, fontSize: 14, marginTop: 4, textAlign: "center" },
    stats: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 16,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.separator,
    },
    stat: { flex: 1, alignItems: "center" },
    statValueRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    statValue: { color: colors.textPrimary, fontSize: 20, fontWeight: "700" },
    statLabel: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
    emptyList: { color: colors.textTertiary, fontSize: 14, textAlign: "center", paddingVertical: 12 },
    statDivider: { width: 1, height: 32, backgroundColor: colors.separator },
    section: { marginTop: 26 },
    sectionLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 12,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    interestChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: radii.pill,
      backgroundColor: colors.interestChipBg,
    },
    interestChipText: { color: colors.interestChipText, fontSize: 13, fontWeight: "500" },
    savedGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    savedCell: { width: "31%" },
    savedImage: {
      width: "100%",
      height: 90,
      borderRadius: radii.profileThumb,
      backgroundColor: colors.field,
    },
    savedPlaceholder: { backgroundColor: colors.separatorThick },
    savedCaption: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
    segment: {
      flexDirection: "row",
      backgroundColor: colors.field,
      borderRadius: radii.pill,
      padding: 4,
      gap: 4,
    },
    segmentItem: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: radii.pill },
    segmentItemActive: { backgroundColor: colors.accent },
    segmentText: { color: colors.textSecondary, fontSize: 14, fontWeight: "500" },
    segmentTextActive: { color: "#fff", fontWeight: "600" },
    langRow: { gap: 8, paddingRight: 8 },
    langChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radii.pill,
      backgroundColor: colors.field,
    },
    langChipActive: { backgroundColor: colors.accent },
    langChipText: { color: colors.textSecondary, fontSize: 14 },
    langChipTextActive: { color: "#fff", fontWeight: "600" },
  });
