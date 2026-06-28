/**
 * Broad-topic classifier for the profile's interest chips. Maps an article's
 * title + short description to a few **global** topic ids (e.g. "sport",
 * "history") via keyword matching. The app turns each id into a short, localized
 * label, so interests stay clear and simple instead of echoing a long, specific
 * Wikipedia description.
 *
 * Keywords are deliberately multilingual (heavy on fr/en, with common es/de/it/
 * pt terms) since the matched text is in the user's content language. Matching is
 * case- and accent-insensitive. A page gets at most MAX_TOPICS_PER_ARTICLE ids.
 */

export const TOPIC_IDS = [
  "sport",
  "history",
  "science",
  "geography",
  "politics",
  "cinema",
  "music",
  "art",
  "technology",
  "religion",
  "nature",
  "literature",
  "videogames",
  "food",
  "health",
  "space",
] as const;

export type TopicId = (typeof TOPIC_IDS)[number];

const MAX_TOPICS_PER_ARTICLE = 2;

// Keyword groups per topic. Order matters: more specific topics first, so e.g. a
// video game isn't swallowed by the generic "technology".
const TOPIC_KEYWORDS: Record<TopicId, string[]> = {
  videogames: [
    "jeu video", "jeux video", "video game", "videogame", "gaming",
    "videojuego", "videogioco", "videospiel", "jogo eletronico",
    "nintendo", "playstation", "xbox", "sega",
  ],
  sport: [
    "sport", "football", "soccer", "basket", "tennis", "rugby", "cyclis", "athlet",
    "olympique", "olympic", "championnat", "champion", "joueur", "footballeur",
    "fussball", "calcio", "futbol", "futebol", "deporte", "esporte", "boxe", "boxing",
    "natation", "ski", "golf", "hockey", "formule 1", "marathon", "gymnast",
  ],
  cinema: [
    "film", "cinema", "movie", "acteur", "actrice", "actor", "actress",
    "realisateur", "director", "serie televis", "television series", "saison",
    "pelicula", "cine", "filme", "schauspieler", "regisseur",
  ],
  music: [
    "musique", "music", "musik", "musica", "chanteur", "chanteuse", "singer",
    "groupe de", "band", "album", "chanson", "song", "compositeur", "composer",
    "musicien", "rappeur", "rapper", "orchestre", "guitarist", "pianist", "opera",
  ],
  art: [
    "peintre", "painter", "peinture", "painting", "sculpteur", "sculpture",
    "artiste", "art ", "oeuvre", "dessinateur", "photographe", "architecte",
    "pintor", "maler", "pittore",
  ],
  literature: [
    "ecrivain", "writer", "auteur", "author", "roman", "novel", "poete", "poet",
    "poesie", "poetry", "litterature", "literature", "nouvelle", "essayiste",
    "escritor", "schriftsteller", "scrittore", "dramaturge", "playwright",
  ],
  politics: [
    "politique", "politician", "president", "ministre", "minister", "parti politique",
    "election", "homme d'etat", "femme d'etat", "depute", "senateur", "chancelier",
    "politic", "politik", "gobierno", "regierung", "diplomate", "maire", "gouverneur",
  ],
  history: [
    "histoire", "history", "historia", "geschichte", "storia", "guerre", "war",
    "bataille", "battle", "empire", "roi ", "king", "reine", "queen", "empereur",
    "emperor", "revolution", "dynastie", "antiquite", "medieval", "moyen age",
    "siecle", "century", "civilisation", "pharaon", "guerra",
  ],
  geography: [
    "ville", "city", "commune", "pays", "country", "region", "fleuve", "riviere",
    "river", "montagne", "mountain", "ile ", "island", "lac ", "lake", "capitale",
    "departement", "geographie", "stadt", "ciudad", "citta", "cidade", "continent",
    "ocean", "mer ", "desert", "village",
  ],
  science: [
    "science", "physique", "physics", "chimie", "chemistry", "biologie", "biology",
    "mathemat", "scientifique", "physicien", "chimiste", "biologiste", "theoreme",
    "geologie", "ciencia", "wissenschaft", "scienza", "atome", "molecule", "genetique",
  ],
  technology: [
    "informatique", "logiciel", "software", "ordinateur", "computer", "technologie",
    "technology", "internet", "intelligence artificielle", "ingenieur", "robot",
    "algorithme", "reseau", "tecnologia", "technik", "telephone", "smartphone",
  ],
  religion: [
    "religion", "eglise", "church", "dieu", "saint", "christianisme", "islam",
    "musulman", "chretien", "juif", "judaisme", "bouddhis", "hindou", "pape",
    "pretre", "theologie", "religios", "kirche", "iglesia", "biblique", "mosquee",
  ],
  nature: [
    "animal", "espece", "species", "plante", "plant", "oiseau", "bird", "poisson",
    "fish", "mammifere", "mammal", "insecte", "insect", "reptile", "arbre", "tree",
    "fleur", "flower", "tier", "planta", "pflanze", "dinosaure", "champignon",
  ],
  food: [
    "cuisine", "plat ", "aliment", "food", "recette", "recipe", "fromage", "cheese",
    "vin ", "wine", "boisson", "gastronomie", "cocktail", "patisserie", "comida",
    "essen", "cibo", "dessert", "biere", "beer",
  ],
  health: [
    "medecine", "medecin", "medicine", "maladie", "disease", "sante", "health",
    "virus", "medicament", "anatomie", "chirurgi", "hopital", "psycholog",
    "medizin", "salud", "krankheit", "vaccin", "epidemie", "pandemie",
  ],
  space: [
    "astronomie", "astronomy", "planete", "planet", "etoile", "galaxie", "galaxy",
    "espace", "spatial", "satellite", "comete", "astronaute", "cosmos", "nasa",
    "astronomia", "weltraum", "telescope", "asteroide", "nebuleuse",
  ],
};

// Pre-compile a matcher per topic. `\b` word boundaries keep short keywords from
// matching inside unrelated words (latin scripts); trailing-space keywords like
// "art " are matched as substrings on purpose.
const TOPIC_MATCHERS: [TopicId, RegExp][] = TOPIC_IDS.map((id) => {
  const parts = TOPIC_KEYWORDS[id].map((k) =>
    k.endsWith(" ") ? escapeRegExp(k) : `\\b${escapeRegExp(k)}`,
  );
  return [id, new RegExp(parts.join("|"), "i")];
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip accents and lowercase, so "Récompense" matches "recompense". */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Classify free text (title + description) into up to two broad topic ids.
 * Returns [] when nothing matches (the article won't seed any interest).
 */
export function classifyTopics(text: string): TopicId[] {
  const haystack = normalize(text);
  const matched: TopicId[] = [];
  for (const [id, matcher] of TOPIC_MATCHERS) {
    if (matcher.test(haystack)) {
      matched.push(id);
      if (matched.length >= MAX_TOPICS_PER_ARTICLE) {
        break;
      }
    }
  }
  return matched;
}
