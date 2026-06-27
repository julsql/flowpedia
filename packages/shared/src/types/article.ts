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

/** An article section (Summary, Habitat, Intelligence…) — see handoff screen 3. */
export interface ArticleSection {
  id: string;
  title: string;
  /** Heading depth: 2 = top-level (h2/lead), 3+ = sub-section. */
  level: number;
  paragraphs: ArticleParagraph[];
  images?: SectionImage[];
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
  rows: InfoboxRow[];
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
  likes: number;
  liked: boolean;
  saved: boolean;
  /** Canonical Wikipedia URL — required for CC BY-SA attribution. */
  sourceUrl: string;
}
