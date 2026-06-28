import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider as NavThemeProvider, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { I18nextProvider } from "react-i18next";
import "../src/web/hideScrollbars";
import { OpenInAppBanner } from "../src/web/OpenInAppBanner";
import i18n from "../src/i18n";
import { ThemeProvider, useTheme } from "../src/theme";
import { UserProvider } from "../src/user/UserProvider";
import { LibraryProvider } from "../src/library/LibraryProvider";
import { SeenProvider } from "../src/seen/SeenProvider";
import { SearchHistoryProvider } from "../src/search/SearchHistoryProvider";
import { ShareSheetProvider } from "../src/share/ShareSheetProvider";

function ThemedNavigation() {
  const { colors, scheme } = useTheme();
  const base = scheme === "light" ? DefaultTheme : DarkTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.bg,
      border: colors.separator,
      text: colors.textPrimary,
      primary: colors.accent,
    },
  };

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
      <OpenInAppBanner />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>
          <UserProvider>
            <LibraryProvider>
              <SeenProvider>
                <SearchHistoryProvider>
                  <ShareSheetProvider>
                    <ThemedNavigation />
                  </ShareSheetProvider>
                </SearchHistoryProvider>
              </SeenProvider>
            </LibraryProvider>
          </UserProvider>
        </ThemeProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
