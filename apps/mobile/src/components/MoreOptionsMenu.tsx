import { useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import type { Article } from "@flowpedia/shared";
import { radii, useTheme, type ThemeColors } from "../theme";
import { useLocale } from "../i18n";
import { useShare } from "../share/ShareSheetProvider";
import { sendEvents } from "../api/client";

/** A "⋯" more-options button (top-right of a feed card) opening a small menu:
 *  copy link, and share to (opens the share sheet). Anchored under the button. */
export function MoreOptionsMenu({
  article,
  color,
  style,
}: {
  article: Article;
  /** Icon tint (e.g. white over the immersive flow). Defaults to the theme. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { openShare } = useShare();
  const btnRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 12 });
  const [copied, setCopied] = useState(false);

  const onOpen = () => {
    setCopied(false);
    btnRef.current?.measureInWindow((x, y, w, h) => {
      setPos({ top: y + h + 6, right: Dimensions.get("window").width - (x + w) });
      setOpen(true);
    });
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(article.sourceUrl);
    sendEvents([{ articleId: article.id, type: "share", ts: Date.now() }]);
    setCopied(true);
    setTimeout(() => setOpen(false), 500);
  };

  const shareTo = () => {
    setOpen(false);
    openShare(article);
  };

  return (
    <>
      <Pressable
        ref={btnRef}
        onPress={onOpen}
        hitSlop={12}
        style={style}
        accessibilityRole="button"
        accessibilityLabel={t("a11y.moreOptions")}
      >
        <MaterialIcons name="more-horiz" size={22} color={color ?? colors.textPrimary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <View style={[styles.menu, { top: pos.top, right: pos.right }]}>
          <Pressable
            style={styles.item}
            onPress={copyLink}
            accessibilityRole="button"
            accessibilityLabel={t("share.copyLink")}
          >
            <MaterialIcons
              name={copied ? "check" : "link"}
              size={20}
              color={copied ? colors.accent : colors.textPrimary}
            />
            <Text style={styles.itemLabel}>
              {copied ? t("share.linkCopied") : t("share.copyLink")}
            </Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            style={styles.item}
            onPress={shareTo}
            accessibilityRole="button"
            accessibilityLabel={t("menu.shareTo")}
          >
            <MaterialIcons name="send" size={20} color={colors.textPrimary} />
            <Text style={styles.itemLabel}>{t("menu.shareTo")}</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    menu: {
      position: "absolute",
      minWidth: 190,
      backgroundColor: colors.surface,
      borderRadius: radii.media,
      paddingVertical: 4,
      // Elevation/shadow so it reads as a floating menu.
      elevation: 8,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    item: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingHorizontal: 16 },
    itemLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: "500" },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginHorizontal: 12 },
  });
}
