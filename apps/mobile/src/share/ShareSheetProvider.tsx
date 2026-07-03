import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import type { Article, PublicUser } from "@flowpedia/shared";
import { radii, spacing, useTheme, type ThemeColors } from "../theme";
import { useLocale } from "../i18n";
import { useLibrary } from "../library/LibraryProvider";
import { useAuth } from "../auth/AuthProvider";
import { shareExternal } from "./shareExternal";
import { RemoteImage } from "../components/RemoteImage";
import { LetterThumb } from "../components/LetterThumb";
import { createStory, fetchTopContacts, searchUsers, sendEvents, sendPage } from "../api/client";

interface ShareSheetValue {
  openShare: (article: Article) => void;
}

const ShareSheetContext = createContext<ShareSheetValue | null>(null);

// Avatar colors for the contact list (white text ≥ 4.5:1 on each).
const AV_COLORS = ["#c77d3a", "#3a7ec7", "#b54f8e", "#4a9d6b", "#9a6cc0"];

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Off-screen start offset for the slide-up animation (larger than the tallest
// the sheet can grow to, so it always begins fully hidden).
const SHEET_OFFSET = 900;

export function ShareSheetProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { recordShare } = useLibrary();
  const auth = useAuth();
  const [article, setArticle] = useState<Article | null>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reshared, setReshared] = useState(false);
  const [topContacts, setTopContacts] = useState<PublicUser[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  // Recipients selected for this send (username → user), Instagram-style: tap to
  // toggle, then send to all at once with the optional message.
  const [selected, setSelected] = useState<Map<string, PublicUser>>(new Map());
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sentDone, setSentDone] = useState(false);
  const translateY = useRef(new Animated.Value(SHEET_OFFSET)).current;

  const openShare = (next: Article) => {
    setArticle(next);
    setCopied(false);
    setReshared(false);
    setQuery("");
    setResults([]);
    setSelected(new Map());
    setNote("");
    setSentDone(false);
    setVisible(true);
    // Suggest the people you message most (only when signed in).
    if (auth.user) {
      fetchTopContacts(8)
        .then(setTopContacts)
        .catch(() => setTopContacts([]));
    } else {
      setTopContacts([]);
    }
  };

  // Debounced user search.
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      searchUsers(term)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const toggleSelect = (u: PublicUser) => {
    setSentDone(false);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(u.username)) {
        next.delete(u.username);
      } else {
        next.set(u.username, u);
      }
      return next;
    });
  };

  const sendSelected = async () => {
    if (!article || selected.size === 0 || sending) {
      return;
    }
    setSending(true);
    try {
      await Promise.all(
        [...selected.values()].map((u) =>
          sendPage({
            toUsername: u.username,
            articleId: article.id,
            title: article.title,
            image: article.image ?? undefined,
            note: note.trim() || undefined,
          }),
        ),
      );
      recordShare(article);
      // Sending a page to someone is a share signal for the profile.
      sendEvents([{ articleId: article.id, type: "share", ts: Date.now() }]);
      setSentDone(true);
      setTimeout(close, 700);
    } catch {
      // keep the sheet open so the user can retry
    } finally {
      setSending(false);
    }
  };

  const reshareToFollowers = async () => {
    if (article && auth.user) {
      try {
        await createStory({ articleId: article.id, title: article.title, image: article.image });
        setReshared(true);
        recordShare(article);
        // Resharing as a story is the strongest interest signal (weighted as a share).
        sendEvents([{ articleId: article.id, type: "story", ts: Date.now() }]);
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
      toValue: SHEET_OFFSET,
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

  // Contacts shown in the picker: search results while typing, else suggestions.
  const people = query.trim() ? results : topContacts;

  return (
    <ShareSheetContext.Provider value={{ openShare }}>
      {children}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {article ? (
              <View style={styles.preview}>
                {article.image ? (
                  <RemoteImage source={{ uri: article.image }} style={styles.previewThumb} />
                ) : (
                  <LetterThumb text={article.title} style={styles.previewThumb} fontSize={18} />
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
              <>
                {/* Search any account (not just top contacts) — no separate page. */}
                <View style={styles.searchBar}>
                  <MaterialIcons name="search" size={20} color={colors.textTertiary} />
                  <TextInput
                    style={styles.searchInput}
                    value={query}
                    onChangeText={setQuery}
                    placeholder={t("send.searchPlaceholder")}
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel={t("a11y.search")}
                  />
                </View>

                {searching ? (
                  <ActivityIndicator color={colors.accent} style={styles.loader} />
                ) : people.length === 0 ? (
                  <Text style={styles.empty}>{t("send.empty")}</Text>
                ) : (
                  <View style={styles.contactsRow}>
                    {people.map((u, i) => {
                      const isSel = selected.has(u.username);
                      return (
                        <Pressable
                          key={u.id}
                          style={styles.contact}
                          onPress={() => toggleSelect(u)}
                          accessibilityRole="button"
                          accessibilityLabel={t("a11y.sendPageTo", { name: u.displayName })}
                          accessibilityState={{ selected: isSel }}
                        >
                          <View style={styles.avatarWrap}>
                            <View
                              style={[
                                styles.avatar,
                                { backgroundColor: AV_COLORS[i % AV_COLORS.length] },
                              ]}
                            >
                              <Text style={styles.avatarText}>{initials(u.displayName)}</Text>
                            </View>
                            {isSel ? (
                              <View style={styles.selBadge}>
                                <MaterialIcons name="check" size={14} color={colors.onAccent} />
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.contactName} numberOfLines={1}>
                            {u.displayName}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </>
            ) : null}
          </ScrollView>

          {/* Message + send bar, shown once at least one recipient is selected. */}
          {auth.user && selected.size > 0 ? (
            <View style={styles.sendBar}>
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder={t("send.notePlaceholder")}
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="sentences"
                accessibilityLabel={t("send.noteLabel")}
              />
              <Pressable
                style={[styles.sendBtn, (sending || sentDone) && styles.sendBtnBusy]}
                onPress={sendSelected}
                disabled={sending || sentDone}
                accessibilityRole="button"
                accessibilityLabel={t("send.send")}
                accessibilityState={{ disabled: sending || sentDone }}
              >
                {sending ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.sendLabel}>
                    {sentDone ? t("send.sent") : t("send.send")}
                  </Text>
                )}
              </Pressable>
            </View>
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
      maxHeight: "86%",
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
    scroll: { flexShrink: 1 },
    scrollContent: { paddingBottom: 4 },
    preview: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
    previewThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.field },
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
      marginBottom: 16,
    },
    reshareLabel: { color: colors.onAccent, fontSize: 15, fontWeight: "700" },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      height: 44,
      borderRadius: radii.pill,
      backgroundColor: colors.field,
      marginBottom: 16,
    },
    searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, height: "100%" },
    loader: { marginTop: 8, marginBottom: 16 },
    empty: {
      color: colors.textTertiary,
      fontSize: 14,
      textAlign: "center",
      marginTop: 4,
      marginBottom: 16,
    },
    contactsRow: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginBottom: 16 },
    contact: { alignItems: "center", gap: 6, width: 64 },
    avatarWrap: { width: 56, height: 56 },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: "#fff", fontSize: 20, fontWeight: "600" },
    selBadge: {
      position: "absolute",
      right: -2,
      bottom: -2,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: colors.surface,
    },
    contactName: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },
    sendBar: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4, marginBottom: 18 },
    noteInput: {
      flex: 1,
      minHeight: 48,
      maxHeight: 100,
      borderRadius: radii.pill,
      backgroundColor: colors.field,
      color: colors.textPrimary,
      paddingHorizontal: 16,
      fontSize: 15,
    },
    sendBtn: {
      minWidth: 96,
      minHeight: 48,
      paddingHorizontal: 20,
      borderRadius: radii.pill,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    sendBtnBusy: { opacity: 0.7 },
    sendLabel: { color: colors.onAccent, fontSize: 15, fontWeight: "700" },
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
