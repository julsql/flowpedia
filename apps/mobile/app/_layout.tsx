import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LocaleProvider } from "../src/i18n";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}
