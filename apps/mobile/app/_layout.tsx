import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider, DarkTheme } from "@react-navigation/native";
import { I18nextProvider } from "react-i18next";
import "../src/web/hideScrollbars";
import i18n from "../src/i18n";
import { colors } from "../src/theme";
import { LibraryProvider } from "../src/library/LibraryProvider";
import { ShareSheetProvider } from "../src/share/ShareSheetProvider";

// Dark navigation theme so navigator backgrounds match the app (no white flash).
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    border: colors.separator,
    text: colors.textPrimary,
    primary: colors.accent,
  },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider value={navTheme}>
          <LibraryProvider>
            <ShareSheetProvider>
              <StatusBar style="light" />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
              </Stack>
            </ShareSheetProvider>
          </LibraryProvider>
        </ThemeProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
