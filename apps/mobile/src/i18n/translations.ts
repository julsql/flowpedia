// Bilingual UI strings. Keep keys identical across locales.
// `locale` also drives the Wikipedia content language (fr.wikipedia / en.wikipedia).
export type Locale = "en" | "fr";

export const LOCALES: Locale[] = ["en", "fr"];

export type TranslationKey = keyof (typeof translations)["en"];

export const translations = {
  en: {
    "tab.home": "Home",
    "tab.explore": "Explore",
    "tab.flow": "Flow",
    "tab.share": "Shared",
    "tab.profile": "Profile",
    "feed.forYou": "For you",
    "feed.popular": "Popular",
    "feed.news": "News",
    "article.readMore": "Read more",
    "article.minRead": "{count} min read",
    "common.retry": "Retry",
    "common.loadError": "Could not load the feed.",
    "common.source": "Source: Wikipedia",
    "settings.language": "Language",
  },
  fr: {
    "tab.home": "Accueil",
    "tab.explore": "Explorer",
    "tab.flow": "Flux",
    "tab.share": "Partagés",
    "tab.profile": "Profil",
    "feed.forYou": "Pour toi",
    "feed.popular": "Populaire",
    "feed.news": "Actualité",
    "article.readMore": "Lire la suite",
    "article.minRead": "lecture {count} min",
    "common.retry": "Réessayer",
    "common.loadError": "Impossible de charger le flux.",
    "common.source": "Source : Wikipédia",
    "settings.language": "Langue",
  },
} as const;
