import { parse, type HTMLElement, type Node } from "node-html-parser";
import type { ArticleInfobox, ArticleSection, InfoboxRow, TextRun } from "@flowpedia/shared";

const TEXT_NODE = 3;
const MAX_SECTIONS = 40;
const MAX_PARAGRAPHS_PER_SECTION = 80;
const MAX_INFOBOX_ROWS = 14;
const MAX_INFOBOX_SCAN = 80; // scan deep enough to reach the biography block
const MIN_SECTION_IMAGE_WIDTH = 100; // skip tiny inline icons/flags

// Infobox "biography" section headings — for a person we keep only these facts
// (birth, death, nationality, places…) and drop the office/function blocks.
const BIOGRAPHY_HEADINGS = new Set<string>(
  [
    "biographie",
    "biography",
    "biografía",
    "biografie",
    "leben",
    "biografia",
    "życiorys",
    "životopis",
    "биография",
    "βιογραφία",
    "传记",
    "生平",
    "経歴",
    "略歴",
    "생애",
    "biyografi",
    "yaşamı",
  ].map((s) => s.toLowerCase()),
);

// Wrappers whose content is chrome, not article prose. Lists (ul/ol) are kept
// now so that bulleted sections like a filmography come through; reference lists
// are still dropped via the "reference" class below.
const SKIP_ANCESTOR_CLASS =
  /infobox|navbox|reference|hatnote|metadata|mw-empty-elt|thumb|gallery|ambox|sidebar|noprint|mbox|toc/i;
const SKIP_ANCESTOR_TAG = new Set(["figure", "table", "style"]);

// Section headings to drop entirely (citations + external links), per the
// supported languages. Compared on the lowercased, trimmed heading text.
const EXCLUDED_SECTION_TITLES = new Set<string>(
  [
    // notes / references
    "references",
    "reference",
    "notes",
    "notes and references",
    "footnotes",
    "citations",
    "notes et références",
    "références",
    "referencias",
    "notas",
    "einzelnachweise",
    "quellen",
    "anmerkungen",
    "fußnoten",
    "note",
    "riferimenti",
    "referências",
    "referenties",
    "voetnoten",
    "bronnen",
    "noten",
    "przypisy",
    "примечания",
    "παραπομπές",
    "σημειώσεις",
    "参考文献",
    "参考资料",
    "注释",
    "脚注",
    "出典",
    "각주",
    "참고 문헌",
    "참고문헌",
    "kaynakça",
    "notlar",
    "dipnotlar",
    // external links
    "external links",
    "liens externes",
    "enlaces externos",
    "weblinks",
    "collegamenti esterni",
    "ligações externas",
    "links externos",
    "externe links",
    "linki zewnętrzne",
    "ссылки",
    "εξωτερικοί σύνδεσμοι",
    "外部链接",
    "外部連結",
    "外部リンク",
    "외부 링크",
    "dış bağlantılar",
    // "see also" / appendices (whole block hidden)
    "see also",
    "voir aussi",
    "annexes",
    "véase también",
    "siehe auch",
    "voci correlate",
    "altri progetti",
    "ver também",
    "zie ook",
    "zobacz też",
    "zobacz także",
    "см. также",
    "δείτε επίσης",
    "参见",
    "另見",
    "関連項目",
    "같이 보기",
    "ayrıca bakınız",
  ].map((s) => s.toLowerCase()),
);

function isExcludedSection(title: string): boolean {
  return EXCLUDED_SECTION_TITLES.has(collapseWhitespace(title).trim().toLowerCase());
}

/**
 * Parse Parsoid/Wikipedia article HTML into clean sections, preserving the page
 * structure (all sections, including list-based ones like a filmography) and
 * internal links as runs (the rabbit-hole mechanism). Citation/external-link
 * sections, infoboxes and other chrome are dropped. `leadTitle` labels the
 * intro section (it has no heading in the source).
 */
export function parseArticleSections(html: string, leadTitle: string): ArticleSection[] {
  const root = parse(html, { comment: false });
  const flow = root.querySelectorAll("h2, h3, h4, p, li, figure");

  const sections: ArticleSection[] = [];
  let current: ArticleSection = { id: "section-0", title: leadTitle, level: 2, paragraphs: [] };
  // Whether the current h2 (and so its sub-headings) is an excluded section.
  let excludedH2 = false;
  // Whether the current heading's content should be skipped.
  let skip = false;

  const flush = () => {
    if (current.paragraphs.length || (current.images && current.images.length)) {
      sections.push(current);
    }
  };

  for (const node of flow) {
    const tag = node.rawTagName?.toLowerCase();
    if (tag === "h2" || tag === "h3" || tag === "h4") {
      flush();
      const title = collapseWhitespace(node.text).trim();
      if (tag === "h2") {
        excludedH2 = isExcludedSection(title);
        skip = excludedH2;
      } else {
        skip = excludedH2 || isExcludedSection(title);
      }
      const level = tag === "h2" ? 2 : tag === "h3" ? 3 : 4;
      current = { id: `section-${sections.length + 1}`, title, level, paragraphs: [] };
    } else if (!skip && (tag === "p" || tag === "li") && isContentNode(node)) {
      if (current.paragraphs.length >= MAX_PARAGRAPHS_PER_SECTION) {
        continue;
      }
      const runs = normalizeRuns(buildRuns(node, tag === "li"));
      if (runs.length) {
        // Prefix list items with a bullet so they read as a list.
        if (tag === "li") {
          runs.unshift({ text: "•  " });
        }
        current.paragraphs.push({ runs });
      }
    } else if (!skip && tag === "figure" && current.id !== "section-0" && isContentNode(node)) {
      // Section illustrations (like Wikipedia thumbnails). The lead image is
      // handled by the summary card, so figures in the intro are skipped.
      const image = figureImage(node);
      if (image) {
        (current.images ??= []).push(image);
      }
    }
  }
  flush();

  return sections.filter((s) => s.title.length > 0 || s.id === "section-0").slice(0, MAX_SECTIONS);
}

/** Collect distinct internal links across sections (fallback "keep exploring"). */
export function collectLinks(sections: ArticleSection[]): { label: string; targetId: string }[] {
  const seen = new Set<string>();
  const links: { label: string; targetId: string }[] = [];
  for (const section of sections) {
    for (const paragraph of section.paragraphs) {
      for (const run of paragraph.runs) {
        if (run.linkTargetId && !seen.has(run.linkTargetId)) {
          seen.add(run.linkTargetId);
          links.push({ label: run.text, targetId: run.linkTargetId });
        }
      }
    }
  }
  return links;
}

function isContentNode(p: HTMLElement): boolean {
  let el: HTMLElement | null = p.parentNode as HTMLElement | null;
  while (el && el.rawTagName) {
    const tag = el.rawTagName.toLowerCase();
    if (SKIP_ANCESTOR_TAG.has(tag)) {
      return false;
    }
    // A list item nested in another list item is emitted on its own; don't also
    // let it bubble up as part of the parent.
    if (SKIP_ANCESTOR_CLASS.test(el.getAttribute("class") ?? "")) {
      return false;
    }
    el = el.parentNode as HTMLElement | null;
  }
  return true;
}

// Inline elements that are small page chrome, not prose: pronunciation audio
// widgets ("Écouter ⓘ"), edit links, non-searchable/non-printing annotations.
const SKIP_INLINE_CLASS =
  /ext-phonos|noexcerpt|navigation-not-searchable|noprint|nomobile|mw-editsection|oo-ui|mw-tmh|metadata|mw-empty-elt/i;
const SKIP_INLINE_TYPEOF = /mw:Extension\/phonos|mw:Audio|mw:Media/i;

function isInlineAnnotation(el: HTMLElement): boolean {
  return (
    SKIP_INLINE_CLASS.test(el.getAttribute("class") ?? "") ||
    SKIP_INLINE_TYPEOF.test(el.getAttribute("typeof") ?? "")
  );
}

function buildRuns(paragraph: HTMLElement, isListItem: boolean): TextRun[] {
  const runs: TextRun[] = [];

  const walk = (node: Node): void => {
    for (const child of node.childNodes) {
      if (child.nodeType === TEXT_NODE) {
        pushText(runs, child.text);
        continue;
      }
      const el = child as HTMLElement;
      const tag = el.rawTagName?.toLowerCase();
      if (!tag) {
        continue;
      }
      // For a list item, nested lists are emitted as their own entries — don't
      // recurse into them here (avoids duplicating their text).
      if (isListItem && (tag === "ul" || tag === "ol")) {
        continue;
      }
      // Drop tiny superscript annotations entirely (citation markers [1], the
      // "Écouter ⓘ" pronunciation widget, edit links, non-printing chrome…).
      if (tag === "sup" || isInlineAnnotation(el)) {
        continue;
      }
      if (tag === "a") {
        const rel = el.getAttribute("rel") ?? "";
        const href = el.getAttribute("href") ?? "";
        const text = el.text;
        if (rel.includes("mw:WikiLink") && href.startsWith("./")) {
          const target = decodeURIComponent(href.slice(2).split("#")[0]);
          // Drop namespaced targets (File:, Category:) — render as plain text.
          if (target.includes(":") || !text.trim()) {
            pushText(runs, text);
          } else {
            runs.push({ text, linkTargetId: target });
          }
        } else {
          pushText(runs, text); // external/other link → plain text
        }
      } else {
        walk(el); // i, b, span, etc. → flatten to text/links
      }
    }
  };

  walk(paragraph);
  return runs;
}

function pushText(runs: TextRun[], text: string): void {
  if (text) {
    runs.push({ text });
  }
}

/** Collapse whitespace, merge adjacent plain runs, trim edges, drop empties. */
function normalizeRuns(runs: TextRun[]): TextRun[] {
  const merged: TextRun[] = [];
  for (const run of runs) {
    const text = collapseWhitespace(run.text);
    if (!text) {
      continue;
    }
    const last = merged[merged.length - 1];
    if (last && !last.linkTargetId && !run.linkTargetId) {
      last.text += text;
    } else {
      merged.push({ text, ...(run.linkTargetId ? { linkTargetId: run.linkTargetId } : {}) });
    }
  }
  if (merged.length) {
    merged[0].text = merged[0].text.replace(/^\s+/, "");
    merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/\s+$/, "");
  }
  return merged.filter((r) => r.text.length > 0);
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

function toInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Resolve a Parsoid image src (often protocol-relative) to an https URL. */
function resolveImageUrl(src: string | undefined): string | undefined {
  if (!src) {
    return undefined;
  }
  if (src.startsWith("//")) {
    return `https:${src}`;
  }
  if (src.startsWith("http")) {
    return src;
  }
  return undefined;
}

/** Extract the image + caption from a <figure>, skipping tiny icons. */
function figureImage(figure: HTMLElement) {
  const img = figure.querySelector("img");
  if (!img) {
    return undefined;
  }
  const width = toInt(img.getAttribute("width"));
  if (width !== undefined && width < MIN_SECTION_IMAGE_WIDTH) {
    return undefined;
  }
  const url = resolveImageUrl(img.getAttribute("src"));
  if (!url) {
    return undefined;
  }
  const cap = figure.querySelector("figcaption");
  const caption = cap ? collapseWhitespace(cap.text).trim() : "";
  return { url, caption: caption || undefined, width, height: toInt(img.getAttribute("height")) };
}

/** Clean visible text of an element (drop citation markers, collapse spaces). */
function cleanCellText(el: HTMLElement): string {
  for (const sup of el.querySelectorAll("sup")) {
    if (/reference|mw-ref/i.test(sup.getAttribute("class") ?? "")) {
      sup.remove();
    }
  }
  return collapseWhitespace(el.text).trim();
}

/**
 * Extract the emblematic Wikipedia summary card (infobox) into structured key
 * facts — rendered as our own "profile header" card, not raw Wikipedia chrome.
 */
export function parseInfobox(html: string): ArticleInfobox | undefined {
  const root = parse(html, { comment: false });
  const table = root.querySelector("table.infobox");
  if (!table) {
    return undefined;
  }

  let image: string | undefined;
  let imageWidth: number | undefined;
  let imageHeight: number | undefined;
  for (const img of table.querySelectorAll("img")) {
    const width = toInt(img.getAttribute("width"));
    if (width === undefined || width >= 60) {
      image = resolveImageUrl(img.getAttribute("src"));
      if (image) {
        imageWidth = width;
        imageHeight = toInt(img.getAttribute("height"));
        break;
      }
    }
  }

  let collected: InfoboxRow[] = [];
  let sawHeading = false;
  let scanned = 0;
  for (const tr of table.querySelectorAll("tr")) {
    if (scanned >= MAX_INFOBOX_SCAN) {
      break;
    }
    scanned += 1;
    const th = tr.querySelector("th");
    const td = tr.querySelector("td");

    // A lone heading cell (e.g. an office title like "President of France") —
    // gives the rows below it their context. The very first one is the page
    // title (redundant with the article title), so it's dropped.
    if (th && !td) {
      const heading = cleanCellText(th);
      if (!heading || heading.length > 80) {
        continue;
      }
      if (!sawHeading) {
        sawHeading = true; // skip the page-title heading
        continue;
      }
      collected.push({ value: heading, heading: true });
      continue;
    }

    if (!th || !td) {
      continue; // image row (td only) or empty
    }
    const label = cleanCellText(th);
    const value = cleanCellText(td);
    if (!label || !value || label.length > 40 || value.length > 180) {
      continue;
    }
    collected.push({ label, value });
  }

  // For a person, the infobox lists offices/functions first, then a "Biography"
  // block with the classic facts (born/died/nationality/places). When present,
  // keep only those facts and drop the function blocks + headings.
  const bioIndex = collected.findIndex(
    (r) => r.heading && BIOGRAPHY_HEADINGS.has(r.value.toLowerCase()),
  );
  if (bioIndex >= 0) {
    collected = collected.slice(bioIndex + 1).filter((r) => !r.heading);
  }

  // Drop a trailing heading with no facts under it, then cap.
  while (collected.length && collected[collected.length - 1].heading) {
    collected.pop();
  }
  const rows = collected.slice(0, MAX_INFOBOX_ROWS);

  if (!image && !rows.length) {
    return undefined;
  }
  return { image, imageWidth, imageHeight, rows };
}
