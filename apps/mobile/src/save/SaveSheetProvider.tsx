import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
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
import type { Article } from "@flowpedia/shared";
import { radii, spacing, useTheme, type ThemeColors } from "../theme";
import { useLocale } from "../i18n";
import { useLibrary } from "../library/LibraryProvider";
import { RemoteImage } from "../components/RemoteImage";
import { LetterThumb } from "../components/LetterThumb";

interface SaveSheetValue {
  /** Open the "save to folder" sheet for an article. */
  openSave: (article: Article) => void;
}

const SaveSheetContext = createContext<SaveSheetValue | null>(null);

const SHEET_OFFSET = 900;

/** Bottom sheet to file a bookmark into a folder (pick one, create one, or
 *  remove the bookmark). Backs the bookmark button across the app. */
export function SaveSheetProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { folders, savedFolderOf, isSaved, saveToFolder, toggleSave } = useLibrary();

  const [article, setArticle] = useState<Article | null>(null);
  const [visible, setVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const translateY = useRef(new Animated.Value(SHEET_OFFSET)).current;

  const openSave = (next: Article) => {
    setArticle(next);
    setCreating(false);
    setName("");
    setVisible(true);
  };

  useEffect(() => {
    if (visible) {
      Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, translateY]);

  const close = () => {
    Animated.timing(translateY, {
      toValue: SHEET_OFFSET,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  const current = article ? savedFolderOf(article.id) ?? "" : "";
  const saved = article ? isSaved(article.id) : false;

  const choose = (folder: string) => {
    if (article) {
      saveToFolder(article, folder);
    }
    close();
  };

  const createAndSave = () => {
    const f = name.trim();
    if (article && f) {
      saveToFolder(article, f);
      close();
    }
  };

  const removeBookmark = () => {
    if (article && saved) {
      toggleSave(article);
    }
    close();
  };

  // "All" (unfiled) first, then the user's folders.
  const options = ["", ...folders];

  return (
    <SaveSheetContext.Provider value={{ openSave }}>
      {children}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />

          {article ? (
            <View style={styles.preview}>
              {article.image ? (
                <RemoteImage source={{ uri: article.image }} style={styles.previewThumb} />
              ) : (
                <LetterThumb text={article.title} style={styles.previewThumb} fontSize={18} />
              )}
              <Text style={styles.previewTitle} numberOfLines={2}>
                {article.title}
              </Text>
            </View>
          ) : null}

          <Text style={styles.title}>{t("save.title")}</Text>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {options.map((folder) => {
              const selected = saved && folder === current;
              const label = folder || t("save.allFolder");
              return (
                <Pressable
                  key={folder || "__all__"}
                  style={styles.row}
                  onPress={() => choose(folder)}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected }}
                >
                  <MaterialIcons
                    name={selected ? "radio-button-checked" : "radio-button-unchecked"}
                    size={22}
                    color={selected ? colors.accent : colors.textTertiary}
                  />
                  <MaterialIcons
                    name={folder ? "folder" : "bookmark-border"}
                    size={20}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}

            {creating ? (
              <View style={styles.newRow}>
                <MaterialIcons name="create-new-folder" size={20} color={colors.accent} />
                <TextInput
                  style={styles.newInput}
                  value={name}
                  onChangeText={setName}
                  placeholder={t("save.folderNamePlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={createAndSave}
                  accessibilityLabel={t("save.folderNamePlaceholder")}
                />
                <Pressable
                  onPress={createAndSave}
                  hitSlop={12}
                  disabled={!name.trim()}
                  accessibilityRole="button"
                  accessibilityLabel={t("save.create")}
                  accessibilityState={{ disabled: !name.trim() }}
                >
                  <Text style={[styles.create, !name.trim() && styles.createDisabled]}>
                    {t("save.create")}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={styles.row}
                onPress={() => setCreating(true)}
                accessibilityRole="button"
                accessibilityLabel={t("a11y.createFolder")}
              >
                <MaterialIcons name="add" size={22} color={colors.accent} />
                <Text style={[styles.rowLabel, { color: colors.accent }]}>{t("save.newFolder")}</Text>
              </Pressable>
            )}
          </ScrollView>

          {saved ? (
            <Pressable
              style={styles.removeBtn}
              onPress={removeBookmark}
              accessibilityRole="button"
              accessibilityLabel={t("save.remove")}
            >
              <MaterialIcons name="bookmark-remove" size={20} color={colors.textPrimary} />
              <Text style={styles.removeLabel}>{t("save.remove")}</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </Modal>
    </SaveSheetContext.Provider>
  );
}

export function useSaveSheet(): SaveSheetValue {
  const ctx = useContext(SaveSheetContext);
  if (!ctx) {
    throw new Error("useSaveSheet must be used within a SaveSheetProvider");
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
      maxHeight: "80%",
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
      marginBottom: 16,
    },
    preview: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
    previewThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.field },
    previewTitle: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
    title: { color: colors.textTertiary, fontSize: 13, fontWeight: "600", marginBottom: 6 },
    scroll: { flexShrink: 1 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
    rowLabel: { flex: 1, color: colors.textPrimary, fontSize: 16 },
    newRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
    newInput: { flex: 1, color: colors.textPrimary, fontSize: 16, height: "100%" },
    create: { color: colors.accent, fontSize: 15, fontWeight: "700" },
    createDisabled: { color: colors.textTertiary },
    removeBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.field,
      borderRadius: 14,
      minHeight: 48,
      marginTop: 12,
    },
    removeLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  });
