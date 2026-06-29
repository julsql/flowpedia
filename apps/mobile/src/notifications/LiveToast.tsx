import { useEffect, useMemo, useRef, type ComponentProps } from "react";
import { Animated, Pressable, StyleSheet, Text } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, useTheme, type ThemeColors } from "../theme";
import { useLocale, type TranslationKey } from "../i18n";
import type { LiveEvent } from "./realtime";

type IconName = ComponentProps<typeof MaterialIcons>["name"];

const COPY: Record<LiveEvent["type"], TranslationKey> = {
  follow_request: "notif.followRequest",
  follower: "notif.follower",
  follow_accepted: "notif.accepted",
  page_received: "notif.pageReceived",
};

const ICON: Record<LiveEvent["type"], IconName> = {
  follow_request: "person-add",
  follower: "person-add",
  follow_accepted: "how-to-reg",
  page_received: "mark-email-unread",
};

/** Transient banner shown at the top when a live event arrives. Tapping it opens
 *  the relevant screen (a conversation for a page, the notifications list else). */
export function LiveToast({ event, onHide }: { event: LiveEvent | null; onHide: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useLocale();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const translateY = useRef(new Animated.Value(-160)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hide = () => {
    Animated.timing(translateY, { toValue: -160, duration: 200, useNativeDriver: true }).start(
      () => onHide(),
    );
  };

  useEffect(() => {
    if (!event) {
      return;
    }
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    timer.current = setTimeout(hide, 4000);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  if (!event) {
    return null;
  }

  const name = event.actor?.displayName ?? t("notif.deletedUser");
  const text = t(COPY[event.type], { name });

  const tap = () => {
    clearTimeout(timer.current);
    if (event.type === "page_received" && event.actor) {
      router.push(`/conversation/${event.actor.username}`);
    } else {
      router.push("/notifications");
    }
    hide();
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      style={[styles.wrap, { paddingTop: insets.top + 8, transform: [{ translateY }] }]}
    >
      <Pressable
        style={styles.toast}
        onPress={tap}
        accessibilityRole="button"
        accessibilityLabel={text}
      >
        <MaterialIcons name={ICON[event.type]} size={22} color={colors.onAccent} />
        <Text style={styles.text} numberOfLines={2}>
          {text}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 12,
      zIndex: 1000,
    },
    toast: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.accent,
      borderRadius: radii.media,
      paddingVertical: 12,
      paddingHorizontal: 14,
      minHeight: 48,
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
    },
    text: { flex: 1, color: colors.onAccent, fontSize: 14, fontWeight: "700" },
  });
}
