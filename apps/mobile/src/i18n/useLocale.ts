import { useTranslation } from "react-i18next";
import { persistLocale } from "./config";
import type { Locale, TranslationKey } from "./config";

interface UseLocaleResult {
  /** Active UI + content locale. */
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Translate a key, with optional `{{placeholder}}` interpolation. */
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

/** Thin, typed wrapper over react-i18next for the app's translation keys. */
export function useLocale(): UseLocaleResult {
  const { t, i18n } = useTranslation();
  return {
    locale: i18n.language as Locale,
    setLocale: (locale) => {
      void i18n.changeLanguage(locale);
      persistLocale(locale);
    },
    t: (key, params) => t(key, params),
  };
}
