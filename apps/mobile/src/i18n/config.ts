import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";

import en from "./locales/en.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import de from "./locales/de.json";
import it from "./locales/it.json";
import pt from "./locales/pt.json";
import nl from "./locales/nl.json";
import pl from "./locales/pl.json";
import ru from "./locales/ru.json";
import el from "./locales/el.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import tr from "./locales/tr.json";

// Supported UI locales. The active locale also drives the Wikipedia content
// language (xx.wikipedia). Keep this list in sync with the API SUPPORTED_LANGS.
export const SUPPORTED_LOCALES = [
  "en",
  "fr",
  "es",
  "de",
  "it",
  "pt",
  "nl",
  "pl",
  "ru",
  "el",
  "zh",
  "ja",
  "ko",
  "tr",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Native language names shown in the language picker. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  nl: "Nederlands",
  pl: "Polski",
  ru: "Русский",
  el: "Ελληνικά",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  tr: "Türkçe",
};

/** Translation keys are derived from the reference locale (en). */
export type TranslationKey = keyof typeof en;

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
  de: { translation: de },
  it: { translation: it },
  pt: { translation: pt },
  nl: { translation: nl },
  pl: { translation: pl },
  ru: { translation: ru },
  el: { translation: el },
  zh: { translation: zh },
  ja: { translation: ja },
  ko: { translation: ko },
  tr: { translation: tr },
};

function detectDeviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode ?? "en";
  return (SUPPORTED_LOCALES as readonly string[]).includes(code) ? (code as Locale) : "en";
}

// TODO(persistence): restore the user's saved choice (AsyncStorage) before init.
void i18n.use(initReactI18next).init({
  resources,
  lng: detectDeviceLocale(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
