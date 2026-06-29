import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import type { Article, PublicUser } from "@flowpedia/shared";
import { radii, spacing, useTheme, type ThemeColors } from "../theme";
import { useLocale } from "../i18n";
import { useLibrary } from "../library/LibraryProvider";
import { useAuth } from "../auth/AuthProvider";
import { shareExternal } from "./shareExternal";
import { createStory, fetchTopContacts, sendEvents, sendPage } from "../api/client";

interface ShareSheetValue {
  openShare: (article: Article) => void;
}

const ShareSheetContext = createContext<ShareSheetValue | null>(null);

// Avatar colors for quick-send contacts (white text ≥ 4.5:1 on each).
const AV_COLORS = ["#c77d3a", "#3a7ec7", "#b54f8e", "#4a9d6b", "#9a6cc0"];

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const SHEET_HEIGHT = 420;

export function ShareSheetProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { recordShare } = useLibrary();
  const auth = useAuth();
  const router = useRouter();
  const [article, setArticle] = useState<Article | null>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reshared, setReshared] = useState(false);
  const [topContacts, setTopContacts] = useState<PublicUser[]>([]);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  const openShare = (next: Article) => {
    setArticle(next);
    setCopied(false);
    setReshared(false);
    setSentTo(new Set());
    setVisible(true);
    // Quick-send row = the people you message most (only when signed in).
    if (auth.user) {
      fetchTopContacts(5)
        .then(setTopContacts)
        .catch(() => setTopContacts([]));
    } else {
      setTopContacts([]);
    }
  };

  const quickSend = async (u: PublicUser) => {
    if (!article || sentTo.has(u.username)) {
      return;
    }
    setSentTo((prev) => new Set(prev).add(u.username));
    try {
      await sendPage({
        toUsername: u.username,
        articleId: article.id,
        title: article.title,
        image: article.image ?? undefined,
      });
      recordShare(article);
    } catch {
      setSentTo((prev) => {
        const next = new Set(prev);
        next.delete(u.username);
        return next;
      });
    }
  };

  const sendToAccount = () => {
    if (article) {
      close();
      router.push({
        pathname: "/send/[articleId]",
        params: {
          articleId: encodeURIComponent(article.id),
          title: article.title,
          image: article.image ?? "",
        },
      });
    }
  };

  const reshareToFollowers = async () => {
    if (article && auth.user) {
      try {
        await createStory({ articleId: article.id, title: article.title, image: article.image });
        setReshared(true);
        recordShare(article);
      } catch {
        // keep the sheet open; the user can retry or share another way
      }
    }
  };

  useEffect(() => {
    if (visible) {
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, translateY]);

  const close = () => {
    Animated.timing(translateY, {
      toValue: SHEET_HEIGHT,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  const shareWith = async () => {
    if (article) {
      // Open the OS share sheet with a "via Flowpedia" tagline (shareExternal
      // logs the share event itself).
      await shareExternal(article, t("share.viaFlowpedia"));
      recordShare(article);
    }
    close();
  };

  const copyLink = async () => {
    if (article) {
      await Clipboard.setStringAsync(article.sourceUrl);
      sendEvents([{ articleId: article.id, type: "share", ts: Date.now() }]);
      recordShare(article);
      setCopied(true);
    }
  };

  return (
    <ShareSheetContext.Provider value={{ openShare }}>
      {children}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />

          {article ? (
            <View style={styles.preview}>
              {article.image ? (
                <Image source={{ uri: article.image }} style={styles.previewThumb} />
              ) : (
                <View style={[styles.previewThumb, styles.previewPlaceholder]} />
              )}
              <View style={styles.previewText}>
                <Text style={styles.previewTitle} numberOfLines={2}>
                  {article.title}
                </Text>
                <Text style={styles.previewMeta}>{`${article.category} · Flowpedia`}</Text>
              </View>
            </View>
          ) : null}

          {auth.user ? (
            <Pressable
              style={styles.reshareBtn}
              onPress={reshareToFollowers}
              accessibilityRole="button"
              accessibilityLabel={t("story.reshare")}
              accessibilityState={{ selected: reshared }}
            >
              <MaterialIcons
                name={reshared ? "check-circle" : "campaign"}
                size={20}
                color={colors.onAccent}
              />
              <Text style={styles.reshareLabel}>
                {reshared ? t("story.reshared") : t("story.reshare")}
              </Text>
            </Pressable>
          ) : null}

          {auth.user ? (
            <Pressable
              style={styles.sendToAccountBtn}
              onPress={sendToAccount}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.sendToAccount")}
            >
              <MaterialIcons name="send" size={20} color={colors.textPrimary} />
              <Text style={styles.sendToAccountLabel}>{t("send.action")}</Text>
            </Pressable>
          ) : null}

          {auth.user && topContacts.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>{t("share.sendTo")}</Text>
              <View style={styles.contactsRow}>
                {topContacts.map((u, i) => {
                  const sent = sentTo.has(u.username);
                  return (
                    <Pressable
                      key={u.id}
                      style={styles.contact}
                      onPress={() => void quickSend(u)}
                      disabled={sent}
                      accessibilityRole="button"
                      accessibilityLabel={t("a11y.sendPageTo", { name: u.displayName })}
                      accessibilityState={{ disabled: sent }}
                    >
                      <View
                        style={[
                          styles.avatar,
                          { backgroundColor: sent ? colors.accent : AV_COLORS[i % AV_COLORS.length] },
                        ]}
                      >
                        {sent ? (
                          <MaterialIcons name="check" size={24} color={colors.onAccent} />
                        ) : (
                          <Text style={styles.avatarText}>{initials(u.displayName)}</Text>
                        )}
                      </View>
                      <Text style={styles.contactName} numberOfLines={1}>
                        {sent ? t("send.sent") : u.displayName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <View style={styles.actionsRow}>
            <Pressable style={styles.action} onPress={copyLink}>
              <MaterialIcons
                name={copied ? "check" : "link"}
                size={22}
                color={copied ? colors.accent : colors.textPrimary}
              />
              <Text style={styles.actionLabel}>
                {copied ? t("share.linkCopied") : t("share.copyLink")}
              </Text>
            </Pressable>
            <Pressable style={styles.action} onPress={shareWith}>
              <MaterialIcons name="more-horiz" size={22} color={colors.textPrimary} />
              <Text style={styles.actionLabel}>{t("share.more")}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Modal>
    </ShareSheetContext.Provider>
  );
}

export function useShare(): ShareSheetValue {
  const ctx = useContext(ShareSheetContext);
  if (!ctx) {
    throw new Error("useShare must be used within a ShareSheetProvider");
  }
  return ctx;
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheetTop,
    borderTopRightRadius: radii.sheetTop,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 10,
    paddingBottom: 36,
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.separator,
    alignSelf: "center",
    marginBottom: 18,
  },
  preview: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  previewThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.field },
  previewPlaceholder: { backgroundColor: colors.separatorThick },
  previewText: { flex: 1 },
  previewTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  previewMeta: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
  reshareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    minHeight: 48,
    marginBottom: 20,
  },
  reshareLabel: { color: colors.onAccent, fontSize: 15, fontWeight: "700" },
  sendToAccountBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.field,
    borderRadius: 14,
    minHeight: 48,
    marginBottom: 20,
  },
  sendToAccountLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 14,
  },
  contactsRow: { flexDirection: "row", gap: 16, marginBottom: 24 },
  contact: { alignItems: "center", gap: 6 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 20, fontWeight: "600" },
  contactName: { color: colors.textSecondary, fontSize: 12 },
  actionsRow: { flexDirection: "row", gap: 10 },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.field,
    borderRadius: 14,
    paddingVertical: 14,
  },
  actionLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: "500" },
});
