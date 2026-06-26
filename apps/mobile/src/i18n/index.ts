import i18n from "./config";

export { useLocale } from "./useLocale";
export { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale, type TranslationKey } from "./config";

/** The initialized i18next instance (import for side-effect init + provider). */
export default i18n;
