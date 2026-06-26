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
import type { Article } from "@flowpedia/shared";
import { radii, spacing, useTheme, type ThemeColors } from "../theme";
import { useLocale } from "../i18n";
import { useLibrary } from "../library/LibraryProvider";
import { sendEvents } from "../api/client";

interface ShareSheetValue {
  openShare: (article: Article) => void;
}

const ShareSheetContext = createContext<ShareSheetValue | null>(null);

const CONTACTS = [
  { name: "Léa", color: "#c77d3a" },
  { name: "Théo", color: "#3a7ec7" },
  { name: "Sara", color: "#b54f8e" },
  { name: "Noé", color: "#4a9d6b" },
  { name: "Mia", color: "#9a6cc0" },
];

const SHEET_HEIGHT = 420;

export function ShareSheetProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { recordShare } = useLibrary();
  const [article, setArticle] = useState<Article | null>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  const openShare = (next: Article) => {
    setArticle(next);
    setCopied(false);
    setVisible(true);
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

  const shareWith = () => {
    if (article) {
      sendEvents([{ articleId: article.id, type: "share", ts: Date.now() }]);
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

          <Text style={styles.sectionLabel}>{t("share.sendTo")}</Text>
          <View style={styles.contactsRow}>
            {CONTACTS.map((contact) => (
              <Pressable
                key={contact.name}
                style={styles.contact}
                onPress={shareWith}
              >
                <View style={[styles.avatar, { backgroundColor: contact.color }]}>
                  <Text style={styles.avatarText}>{contact.name.charAt(0)}</Text>
                </View>
                <Text style={styles.contactName}>{contact.name}</Text>
              </Pressable>
            ))}
          </View>

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
              <MaterialIcons name="chat-bubble-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.actionLabel}>{t("share.messages")}</Text>
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
