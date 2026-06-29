/**
 * A run of text inside a paragraph. When `linkTargetId` is set, the run is an
 * internal link to another article — the "bounce" mechanism at the core of the
 * product (tap to open the target article).
 */
export interface TextRun {
  text: string;
  linkTargetId?: string;
  /**
   * A colour key/swatch (e.g. a results-grid legend entry): renders as a small
   * filled square. When set, `text` is empty — the label follows in the next run.
   */
  swatch?: string;
  /**
   * Superscript / subscript ordinal or index (e.g. the "e" in "16ᵉ", the "2" in
   * "H₂O"). Rendered as raised/lowered smaller text by the app — we keep the raw
   * text rather than rare Unicode modifier glyphs, which many device fonts lack.
   */
  sup?: boolean;
  sub?: boolean;
}

/** A paragraph, made of plain-text and internal-link runs. */
export interface ArticleParagraph {
  runs: TextRun[];
}

/** An illustrative image inside a section (rendered like Wikipedia thumbnails). */
export interface SectionImage {
  url: string;
  caption?: string;
  width?: number;
  height?: number;
  /**
   * How many of the section's paragraphs precede this image in the source, so
   * the app can place it at its real spot in the text (like mobile Wikipedia)
   * instead of bunching all images at the top of the section.
   */
  afterParagraph?: number;
  /**
   * The caption as rich runs when it contains internal links (kept tappable);
   * `caption` stays as the plain-text fallback. Absent when the caption has no
   * link.
   */
  captionRuns?: TextRun[];
}

/**
 * A table cell. `runs` carry the text (links inside the table stay tappable);
 * `image` is a picture in the cell (e.g. a participant photo); `background` is
 * the cell's colour when it's meaningful (the "code couleur" of results grids,
 * e.g. green = qualified, red = eliminated).
 */
export interface TableCell {
  runs: TextRun[];
  image?: string;
  background?: string;
}

/**
 * A content table (Wikipedia "wikitable"), e.g. the per-month list on a
 * "Deaths in 2026" page. Rendered as a real table, not flattened to prose.
 */
export interface ArticleTable {
  headers: string[];
  rows: TableCell[][];
}

/** One slice of a pie chart (e.g. a religion's share). */
export interface ChartSlice {
  label: string;
  /** Percentage (0–100). */
  value: number;
  /** CSS color (named or hex) from the source chart. */
  color: string;
}

/**
 * A pie chart reconstructed from a Wikipedia CSS pie (which can't be shown as an
 * image — it's an empty frame with CSS-overlaid slices), so we can draw it.
 */
export interface ArticleChart {
  title?: string;
  slices: ChartSlice[];
}

/** An article section (Summary, Habitat, Intelligence…) — see handoff screen 3. */
export interface ArticleSection {
  id: string;
  title: string;
  /** Heading depth: 2 = top-level (h2/lead), 3+ = sub-section. */
  level: number;
  paragraphs: ArticleParagraph[];
  images?: SectionImage[];
  /** Content tables (wikitables) in this section. */
  tables?: ArticleTable[];
  /** "Main article" links ({{Article détaillé}}) pointing to a dedicated page. */
  mainLinks?: ArticleLink[];
}

/**
 * A row in the summary card. Either a key fact ("Born → 1867") or a group
 * heading that gives the following facts their context (e.g. an office held,
 * "President of France", above its election/term rows).
 */
export interface InfoboxRow {
  /** Absent on heading rows. */
  label?: string;
  value: string;
  /**
   * The value as rich runs when it contains internal links (kept tappable);
   * `value` stays as the plain-text fallback. Absent when the value has no link.
   */
  valueRuns?: TextRun[];
  /** True when this row is a section title rather than a label/value fact. */
  heading?: boolean;
}

/** Structured summary card extracted from the Wikipedia infobox. */
export interface ArticleInfobox {
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  /**
   * Locator/position map from the infobox (e.g. a region highlighted within its
   * country), when present — a separate image from the lead image.
   */
  mapImage?: string;
  mapImageWidth?: number;
  mapImageHeight?: number;
  /**
   * Position of the place marker (pin) over the locator map, as percentages
   * (0–100) of the map's width/height — Wikipedia draws it as a CSS-positioned
   * overlay, so we keep the coordinates and redraw the dot in the app. Absent
   * when the map has no marker (e.g. a plain region outline). Mirrors `maps[0]`
   * for older clients/cache.
   */
  mapMarkerTop?: number;
  mapMarkerLeft?: number;
  /**
   * All locator maps the page offers (country, region, département…), each with
   * its own marker — so the app can let the user switch the framing. `maps[0]`
   * is the default and matches the `mapImage`/`mapMarker*` fields above.
   */
  maps?: ArticleLocatorMap[];
  rows: InfoboxRow[];
}

/** One selectable locator map: the place shown within a given area. */
export interface ArticleLocatorMap {
  image: string;
  width?: number;
  height?: number;
  /** Pin position as percentages (0–100) of the map, when the map has one. */
  markerTop?: number;
  markerLeft?: number;
  /** Area name for the switcher (e.g. "France", "Bourgogne-Franche-Comté"). */
  label?: string;
}

/**
 * One ancestor from the page's ahnentafel ("ascendance") chart. `position` is
 * the ahnentafel number (1 = the subject, 2 = father, 3 = mother, 4-7 =
 * grandparents…), from which the app derives the generation (⌊log2(position)⌋).
 */
export interface AncestryEntry {
  position: number;
  label: string;
  targetId?: string;
}

/** A distinct internal link found in the article (for "keep exploring" lists). */
export interface ArticleLink {
  /** Displayed text (link label). */
  label: string;
  /** Wikipedia id/title of the target article. */
  targetId: string;
}

/** Article as consumed by the feed and the detail screen. */
export interface Article {
  /** Normalized Wikipedia title, used as a stable id. */
  id: string;
  category: string;
  title: string;
  summary: string;
  /**
   * Broad topic ids the article belongs to (e.g. "sport", "history"), inferred
   * from its title/description. Used to build the profile's interest chips —
   * stable ids the app localizes to short, global category labels.
   */
  topics?: string[];
  /** Highlight image (thumbnail/lead). Absent when Wikipedia provides none. */
  image?: string;
  /** Lead image natural size, so the reader can keep its aspect ratio. */
  imageWidth?: number;
  imageHeight?: number;
  readingMinutes?: number;
  sections: ArticleSection[];
  links: ArticleLink[];
  /** Emblematic Wikipedia summary card (key facts), when the page has one. */
  infobox?: ArticleInfobox;
  /** Pie charts reconstructed from the page (e.g. a religion breakdown). */
  charts?: ArticleChart[];
  /** Ancestors from the page's ahnentafel chart (when present). */
  ancestry?: AncestryEntry[];
  likes: number;
  liked: boolean;
  saved: boolean;
  /** Canonical Wikipedia URL — required for CC BY-SA attribution. */
  sourceUrl: string;
}
