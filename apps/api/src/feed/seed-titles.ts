/**
 * Starter list for the MVP "popular" feed (simple recommendation).
 * Until user signals exist, we serve these varied topics.
 * Later: replaced by most-viewed pages + the content-based algorithm.
 * Titles are language-specific (they must match the target Wikipedia).
 */
export const SEED_TITLES_BY_LANG: Record<"en" | "fr", string[]> = {
  fr: [
    "Pieuvre",
    "Trou_noir",
    "Empire_romain",
    "Frida_Kahlo",
    "Mars_(planète)",
    "Renaissance_(période_historique)",
    "Manchot_empereur",
    "Théorie_de_la_relativité",
    "Mont_Everest",
    "Léonard_de_Vinci",
    "Grande_Barrière_de_corail",
    "Intelligence_artificielle",
    "Pyramides_de_Gizeh",
    "Mémoire_des_éléphants",
    "Aurore_polaire",
  ],
  en: [
    "Octopus",
    "Black_hole",
    "Roman_Empire",
    "Frida_Kahlo",
    "Mars",
    "Renaissance",
    "Emperor_penguin",
    "Theory_of_relativity",
    "Mount_Everest",
    "Leonardo_da_Vinci",
    "Great_Barrier_Reef",
    "Artificial_intelligence",
    "Giza_pyramid_complex",
    "Elephant_cognition",
    "Aurora",
  ],
};
