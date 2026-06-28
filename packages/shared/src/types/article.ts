/**
 * A run of text inside a paragraph. When `linkTargetId` is set, the run is an
 * internal link to another article — the "bounce" mechanism at the core of the
 * product (tap to open the target article).
 */
export interface TextRun {
  text: string;
  linkTargetId?: string;
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
   * when the map has no marker (e.g. a plain region outline).
   */
  mapMarkerTop?: number;
  mapMarkerLeft?: number;
  rows: InfoboxRow[];
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
