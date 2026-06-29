import { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useTheme, type ThemeColors } from "../theme";

interface TextLinkProps {
  label: string;
  onPress: () => void;
  /** Optional leading muted text, e.g. "No account yet? " before the link. */
  prefix?: string;
  accessibilityLabel?: string;
}

/** Accessible inline link (role=link, ≥44px target via padding). */
export function TextLink({ label, onPress, prefix, accessibilityLabel }: TextLinkProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? `${prefix ?? ""}${label}`}
      style={styles.pressable}
    >
      <Text style={styles.text}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <Text style={styles.link}>{label}</Text>
      </Text>
    </Pressable>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    pressable: { minHeight: 44, justifyContent: "center", paddingVertical: 6 },
    text: { textAlign: "center", fontSize: 15 },
    prefix: { color: colors.textSecondary },
    link: { color: colors.accentLinkText, fontWeight: "700" },
  });
}
