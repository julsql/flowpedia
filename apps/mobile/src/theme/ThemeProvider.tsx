import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkColors, lightColors, type ThemeColors } from "@flowpedia/shared";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedScheme = "light" | "dark";

const STORAGE_KEY = "flowpedia.theme";

interface ThemeValue {
  /** Active palette (resolved from mode + device scheme). */
  colors: ThemeColors;
  mode: ThemeMode;
  scheme: ResolvedScheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const device = useColorScheme(); // 'light' | 'dark' | null
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark" || saved === "system") {
        setModeState(saved);
      }
    });
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const scheme: ResolvedScheme = mode === "system" ? (device ?? "dark") : mode;
  const colors = scheme === "light" ? lightColors : darkColors;

  const value = useMemo<ThemeValue>(
    () => ({ colors, mode, scheme, setMode }),
    [colors, mode, scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
