import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Interest, ProfileView } from "@flowpedia/shared";
import { radii, spacing, useTheme, type ThemeColors, type ThemeMode } from "../../src/theme";
import { ScreenContainer, centeredColumn } from "../../src/components/ScreenContainer";
import { RemoteImage } from "../../src/components/RemoteImage";
import { fetchInterests, fetchProfile } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthProvider";
import { PrimaryButton } from "../../src/components/PrimaryButton";
import { TextLink } from "../../src/components/TextLink";
import { useLibrary } from "../../src/library/LibraryProvider";
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

// Cap how many kept titles we send for interest derivation (most recent first).
const MAX_INTEREST_SEEDS = 40;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, mode, setMode, contrast, setContrast } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, locale, setLocale } = useLocale();
  const auth = useAuth();
  const { read, liked, saved, mutedInterests, muteInterest, removeRead, clearRead } = useLibrary();

  // Which list (history / liked / saved) is expanded under the stats, if any.
  const [openList, setOpenList] = useState<"read" | "liked" | "saved" | null>(null);

  // Titles the user kept, deduped, most recent first — the input the API turns
  // into adaptive interest chips (real Wikipedia categories at the right level).
  const keptIds = useMemo(() => {
    const ids = [...liked, ...saved, ...read].map((a) => a.id);
    return Array.from(new Set(ids)).slice(0, MAX_INTEREST_SEEDS);
  }, [liked, saved, read]);
  const keptKey = keptIds.join(",");

  const [interests, setInterests] = useState<Interest[]>([]);
  useEffect(() => {
    if (!keptIds.length) {
      setInterests([]);
      return;
    }
    let active = true;
    void fetchInterests(keptIds, locale).then((res) => {
      if (active) {
        setInterests(res);
      }
    });
    return () => {
      active = false;
    };
    // keptKey captures changes to keptIds; locale also re-derives (labels follow language).
  }, [keptKey, locale]);

  const visibleInterests = useMemo(() => {
    const muted = new Set(mutedInterests);
    return interests.filter((i) => !muted.has(i.id));
  }, [interests, mutedInterests]);

  // Own follower/following counts (only when signed in).
  const [ownProfile, setOwnProfile] = useState<ProfileView | null>(null);
  useEffect(() => {
    if (!auth.user) {
      setOwnProfile(null);
      return;
    }
    let active = true;
    fetchProfile(auth.user.username)
      .then((p) => active && setOwnProfile(p))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [auth.user?.id]);

  const openArticle = (id: string) =>
    router.push({ pathname: "/article/[id]", params: { id: encodeURIComponent(id) } });

  const searchInterest = (interest: string) =>
    router.push({ pathname: "/(tabs)/explore", params: { q: interest } });

  const listArticles =
    openList === "read" ? read : openList === "liked" ? liked : openList === "saved" ? saved : [];

  return (
    <ScreenContainer style={{ paddingTop: insets.top + 16 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, centeredColumn]}
      >
        {/* Identity — real account when signed in, neutral guest otherwise */}
        <View style={styles.identity}>
          {auth.user ? (
            <>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(auth.user.displayName)}</Text>
              </View>
              <Text style={styles.name}>{auth.user.displayName}</Text>
              <Text style={styles.handle}>@{auth.user.username}</Text>
            </>
          ) : (
            <>
              <View style={styles.avatar}>
                <MaterialIcons name="person" size={34} color={colors.mutedLight} />
              </View>
              <Text style={styles.name}>{t("auth.guestTitle")}</Text>
              <Text style={styles.bio}>{t("auth.guestSubtitle")}</Text>
            </>
          )}
        </View>

        {/* Account — sign in (guest) or account summary + sign out (authenticated) */}
        {auth.status === "authenticated" && auth.user ? (
          <View style={styles.accountCard}>
            <Text style={styles.accountEmail} numberOfLines={1}>
              {auth.user.email}
            </Text>
            {ownProfile ? (
              <View style={styles.profileCounts}>
                <Pressable
                  style={styles.profileCount}
                  onPress={() => router.push(`/u/${auth.user!.username}/followers`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${ownProfile.followers} ${t("social.followers")}`}
                >
                  <Text style={styles.profileCountValue}>{ownProfile.followers}</Text>
                  <Text style={styles.profileCountLabel}>{t("social.followers")}</Text>
                </Pressable>
                <Pressable
                  style={styles.profileCount}
                  onPress={() => router.push(`/u/${auth.user!.username}/following`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${ownProfile.following} ${t("social.following")}`}
                >
                  <Text style={styles.profileCountValue}>{ownProfile.following}</Text>
                  <Text style={styles.profileCountLabel}>{t("social.following")}</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable
              onPress={() => router.push("/people")}
              style={styles.accountRow}
              accessibilityRole="button"
              accessibilityLabel={t("social.findPeople")}
            >
              <MaterialIcons name="person-search" size={20} color={colors.textSecondary} />
              <Text style={styles.accountRowText}>{t("social.findPeople")}</Text>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
            <Pressable
              onPress={() => router.push("/requests")}
              style={styles.accountRow}
              accessibilityRole="button"
              accessibilityLabel={t("social.requests")}
            >
              <MaterialIcons name="how-to-reg" size={20} color={colors.textSecondary} />
              <Text style={styles.accountRowText}>{t("social.requests")}</Text>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
            <Pressable
              onPress={() => router.push("/notifications")}
              style={styles.accountRow}
              accessibilityRole="button"
              accessibilityLabel={t("notif.title")}
            >
              <MaterialIcons name="notifications-none" size={20} color={colors.textSecondary} />
              <Text style={styles.accountRowText}>{t("notif.title")}</Text>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
            <Pressable
              onPress={() => router.push("/inbox")}
              style={styles.accountRow}
              accessibilityRole="button"
              accessibilityLabel={t("inbox.title")}
            >
              <MaterialIcons name="inbox" size={20} color={colors.textSecondary} />
              <Text style={styles.accountRowText}>{t("inbox.title")}</Text>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
            <Pressable
              onPress={() => router.push("/account")}
              style={styles.accountRow}
              accessibilityRole="button"
              accessibilityLabel={t("account.manage")}
            >
              <MaterialIcons name="manage-accounts" size={20} color={colors.textSecondary} />
              <Text style={styles.accountRowText}>{t("account.manage")}</Text>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
            <Pressable
              onPress={() => void auth.logout()}
              style={styles.signOutBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("auth.signOut")}
            >
              <MaterialIcons name="logout" size={18} color={colors.danger} />
              <Text style={styles.signOutText}>{t("auth.signOut")}</Text>
            </Pressable>
          </View>
        ) : auth.status === "guest" ? (
          <View style={styles.accountCard}>
            <Text style={styles.accountTitle}>{t("auth.guestTitle")}</Text>
            <Text style={styles.accountSubtitle}>{t("auth.guestSubtitle")}</Text>
            <PrimaryButton label={t("auth.signIn")} onPress={() => router.push("/auth/login")} />
            <TextLink
              prefix={t("auth.noAccount")}
              label={t("auth.createAccount")}
              onPress={() => router.push("/auth/register")}
            />
          </View>
        ) : null}

        {/* Stats — Liked / Saved are tappable to reveal their pages. */}
        <View style={styles.stats}>
          <Stat
            styles={styles}
            colors={colors}
            value={read.length}
            label={t("profile.read")}
            icon="history"
            active={openList === "read"}
            onPress={() => setOpenList((v) => (v === "read" ? null : "read"))}
          />
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

        {/* History / liked / saved list (toggled from the stats above). */}
        {openList ? (
          <View style={styles.section}>
            {openList === "read" && listArticles.length > 0 ? (
              <View style={styles.listHeader}>
                <Pressable
                  onPress={clearRead}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.clearAll")}
                >
                  <Text style={styles.listClear}>{t("common.clearAll")}</Text>
                </Pressable>
              </View>
            ) : null}
            {listArticles.length === 0 ? (
              <Text style={styles.emptyList}>{t("profile.emptyList")}</Text>
            ) : (
              <View style={styles.savedGrid}>
                {listArticles.map((article) => (
                  <Pressable
                    key={article.id}
                    style={styles.savedCell}
                    onPress={() => openArticle(article.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t("a11y.openArticle", { title: article.title })}
                  >
                    {article.image ? (
                      <RemoteImage
                        source={{ uri: article.image }}
                        style={styles.savedImage}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                      />
                    ) : (
                      <View style={[styles.savedImage, styles.savedPlaceholder]} />
                    )}
                    {openList === "read" ? (
                      <Pressable
                        style={styles.deleteBadge}
                        onPress={() => removeRead(article.id)}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={t("a11y.removeFromHistory")}
                      >
                        <MaterialIcons name="close" size={14} color="#fff" />
                      </Pressable>
                    ) : null}
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
        {visibleInterests.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t("profile.interests")}</Text>
            <View style={styles.chips}>
              {visibleInterests.map((interest) => (
                <View key={interest.id} style={styles.interestChip}>
                  {/* Tap the label to search this theme; tap the cross to mute it. */}
                  <Pressable
                    onPress={() => searchInterest(interest.label)}
                    hitSlop={10}
                    style={styles.interestChipLabel}
                    accessibilityRole="button"
                    accessibilityLabel={t("a11y.searchInterest", { interest: interest.label })}
                  >
                    <Text style={styles.interestChipText} numberOfLines={1}>
                      {interest.label}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => muteInterest(interest.id)}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={t("a11y.muteInterest", { interest: interest.label })}
                  >
                    <MaterialIcons name="close" size={15} color={colors.interestChipText} />
                  </Pressable>
                </View>
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
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t(label)}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {t(label)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("settings.contrast")}</Text>
            <Switch
              value={contrast}
              onValueChange={setContrast}
              accessibilityRole="switch"
              accessibilityLabel={t("settings.contrast")}
              accessibilityState={{ checked: contrast }}
              trackColor={{ true: colors.accent, false: colors.separator }}
            />
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
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={LOCALE_LABELS[code]}
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
  icon?: "favorite" | "bookmark" | "history";
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
      <Pressable
        style={styles.stat}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ expanded: active }}
        accessibilityLabel={`${value} ${label}`}
      >
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
    handle: { color: colors.accentLinkText, fontSize: 14, marginTop: 4, fontWeight: "600" },
    accountCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.media,
      borderWidth: 1,
      borderColor: colors.separator,
      padding: 16,
      marginBottom: 24,
      gap: 12,
    },
    accountTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
    accountSubtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
    accountEmail: { color: colors.textSecondary, fontSize: 14 },
    accountRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 44,
    },
    accountRowText: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
    profileCounts: { flexDirection: "row", gap: 8 },
    profileCount: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 6,
      minHeight: 44,
      justifyContent: "center",
    },
    profileCountValue: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
    profileCountLabel: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
    signOutBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      alignSelf: "flex-start",
      minHeight: 44,
    },
    signOutText: { color: colors.danger, fontSize: 15, fontWeight: "600" },
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
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 14,
      minHeight: 44,
    },
    toggleLabel: { fontSize: 15, color: colors.textPrimary },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    interestChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: radii.pill,
      backgroundColor: colors.interestChipBg,
      maxWidth: "100%",
    },
    interestChipLabel: { flexShrink: 1 },
    interestChipText: { color: colors.interestChipText, fontSize: 13, fontWeight: "500" },
    listHeader: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 10 },
    listClear: { color: colors.accentLinkText, fontSize: 13, fontWeight: "600" },
    savedGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    savedCell: { width: "31%" },
    // Per-item delete badge on a history thumbnail.
    deleteBadge: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
    },
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
