import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme, type ThemeColors } from "../theme";

/** A labelled checkbox row (title + optional hint). Uses `accessibilityState.checked`
 *  and a 44px target — pair with an explicit `accessibilityLabel` when the visible
 *  title isn't self-descriptive. */
export function Checkbox({
  label,
  hint,
  value,
  onValueChange,
  accessibilityLabel,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      style={styles.row}
      onPress={() => onValueChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={8}
    >
      <View style={styles.text}>
        <Text style={styles.title}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={[styles.box, value && styles.boxChecked]}>
        {value ? <MaterialIcons name="check" size={18} color={colors.onAccent} /> : null}
      </View>
    </Pressable>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingVertical: 6 },
    text: { flex: 1 },
    title: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
    hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 },
    box: {
      width: 26,
      height: 26,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: colors.separatorThick,
      alignItems: "center",
      justifyContent: "center",
    },
    boxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  });
}
