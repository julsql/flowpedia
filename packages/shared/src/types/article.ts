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

/** An article section (Summary, Habitat, Intelligence…) — see handoff screen 3. */
export interface ArticleSection {
  id: string;
  title: string;
  paragraphs: ArticleParagraph[];
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
  readingMinutes?: number;
  sections: ArticleSection[];
  links: ArticleLink[];
  likes: number;
  liked: boolean;
  saved: boolean;
  /** Canonical Wikipedia URL — required for CC BY-SA attribution. */
  sourceUrl: string;
}
