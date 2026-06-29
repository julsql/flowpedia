import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { radii, useTheme, type ThemeColors } from "../theme";

interface FormFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Validation/error message shown below the field (with an icon, not color-only). */
  error?: string;
  hint?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
  returnKeyType?: TextInputProps["returnKeyType"];
  onSubmitEditing?: () => void;
  /** a11y labels for the password visibility toggle. */
  showLabel?: string;
  hideLabel?: string;
}

/** Labeled text input. The label doubles as the accessibilityLabel (a placeholder
 *  is never a label — 4.1.2). Password fields get an accessible show/hide toggle. */
export function FormField({
  label,
  value,
  onChangeText,
  error,
  hint,
  secureTextEntry = false,
  keyboardType,
  autoCapitalize = "none",
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
  showLabel = "Show password",
  hideLabel = "Hide password",
}: FormFieldProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [hidden, setHidden] = useState(secureTextEntry);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, !!error && styles.inputRowError]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          placeholderTextColor={colors.muted}
          accessibilityLabel={label}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setHidden((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={hidden ? showLabel : hideLabel}
            accessibilityState={{ expanded: !hidden }}
            style={styles.eye}
          >
            <MaterialIcons
              name={hidden ? "visibility" : "visibility-off"}
              size={20}
              color={colors.muted}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <MaterialIcons name="error-outline" size={15} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { gap: 6 },
    label: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.field,
      borderRadius: radii.media,
      borderWidth: 1,
      borderColor: colors.separator,
      paddingHorizontal: 14,
    },
    inputRowError: { borderColor: colors.danger },
    input: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 16,
      minHeight: 48, // ≥44px touch target
    },
    eye: { padding: 4, marginLeft: 4 },
    errorRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    errorText: { color: colors.danger, fontSize: 13, flex: 1 },
    hint: { color: colors.muted, fontSize: 13 },
  });
}
