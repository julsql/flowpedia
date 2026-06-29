import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  darkColors,
  highContrastDark,
  highContrastLight,
  lightColors,
  type ThemeColors,
} from "@flowpedia/shared";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedScheme = "light" | "dark";

const STORAGE_KEY = "flowpedia.theme";
const CONTRAST_KEY = "flowpedia.contrast";

interface ThemeValue {
  /** Active palette (resolved from mode + device scheme + contrast). */
  colors: ThemeColors;
  mode: ThemeMode;
  scheme: ResolvedScheme;
  setMode: (mode: ThemeMode) => void;
  /** High-contrast (pure black/white) palette toggle. */
  contrast: boolean;
  setContrast: (on: boolean) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const device = useColorScheme(); // 'light' | 'dark' | null
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [contrast, setContrastState] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark" || saved === "system") {
        setModeState(saved);
      }
    });
    void AsyncStorage.getItem(CONTRAST_KEY).then((saved) => {
      if (saved === "1") {
        setContrastState(true);
      }
    });
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const setContrast = (on: boolean) => {
    setContrastState(on);
    void AsyncStorage.setItem(CONTRAST_KEY, on ? "1" : "0");
  };

  const scheme: ResolvedScheme = mode === "system" ? (device ?? "dark") : mode;
  const colors = contrast
    ? scheme === "light"
      ? highContrastLight
      : highContrastDark
    : scheme === "light"
      ? lightColors
      : darkColors;

  const value = useMemo<ThemeValue>(
    () => ({ colors, mode, scheme, setMode, contrast, setContrast }),
    [colors, mode, scheme, contrast],
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
