import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { radii, spacing, useTheme, type ThemeColors } from "../theme";

/** Shared pulsing animation value (0.4 ↔ 1 opacity). */
function usePulse(): Animated.Value {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
}

/** Pulsing grid cell placeholder (Explore search/trending). */
export function SkeletonCell({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const pulse = usePulse();
  return <Animated.View style={[style, { backgroundColor: colors.field, opacity: pulse }]} />;
}

/** Pulsing placeholder shown while a feed loads, so tabs/reloads never flash
 * stale content. Mirrors the ArticleCard layout (image, title, text lines). */
export function SkeletonCard() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const pulse = usePulse();

  return (
    <Animated.View style={[styles.card, { opacity: pulse }]}>
      <View style={styles.metaLine} />
      <View style={styles.image} />
      <View style={styles.titleLine} />
      <View style={styles.line} />
      <View style={styles.line} />
      <View style={[styles.line, styles.lineShort]} />
    </Animated.View>
  );
}

/** A column of skeleton cards filling the feed area. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.bg,
      paddingHorizontal: spacing.screenPadding,
      paddingVertical: 16,
    },
    metaLine: { width: 90, height: 11, borderRadius: 4, backgroundColor: colors.field, marginBottom: 12 },
    image: { width: "100%", height: 240, borderRadius: radii.media, backgroundColor: colors.field },
    titleLine: {
      width: "70%",
      height: 20,
      borderRadius: 5,
      backgroundColor: colors.field,
      marginTop: 14,
    },
    line: { width: "100%", height: 13, borderRadius: 4, backgroundColor: colors.field, marginTop: 10 },
    lineShort: { width: "45%" },
  });
