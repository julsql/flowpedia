import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { getLocales } from "expo-localization";
import { LOCALES, translations, type Locale, type TranslationKey } from "./translations";

interface LocaleContextValue {
  /** Active UI + content locale. */
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Translate a key, with optional `{placeholder}` interpolation. */
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/** Resolve the device language, falling back to English. */
function resolveDeviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode ?? "en";
  return (LOCALES as string[]).includes(code) ? (code as Locale) : "en";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  // TODO(persistence): restore the user's saved choice (AsyncStorage / profile) here.
  const [locale, setLocale] = useState<Locale>(resolveDeviceLocale);

  const t = useCallback<LocaleContextValue["t"]>(
    (key, params) => {
      let value: string = translations[locale][key] ?? translations.en[key] ?? key;
      if (params) {
        for (const [name, raw] of Object.entries(params)) {
          value = value.replace(`{${name}}`, String(raw));
        }
      }
      return value;
    },
    [locale],
  );

  const contextValue = useMemo<LocaleContextValue>(() => ({ locale, setLocale, t }), [locale, t]);

  return <LocaleContext.Provider value={contextValue}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return ctx;
}
