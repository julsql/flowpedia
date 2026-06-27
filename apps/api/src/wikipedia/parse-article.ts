import { parse, type HTMLElement, type Node } from "node-html-parser";
import type {
  ArticleInfobox,
  ArticleLink,
  ArticleSection,
  ArticleTable,
  InfoboxRow,
  TableCell,
  TextRun,
} from "@flowpedia/shared";

const TEXT_NODE = 3;
const MAX_SECTIONS = 40;
const MAX_PARAGRAPHS_PER_SECTION = 80;
const MAX_INFOBOX_ROWS = 16; // total label/value rows kept (headings not counted)
const PER_BLOCK_ROWS = 3; // facts kept per theme when an infobox spans many blocks
const MAX_INFOBOX_SCAN = 140; // scan deep enough across a multi-table (v3) infobox
const MIN_SECTION_IMAGE_WIDTH = 100; // skip tiny inline icons/flags
const MAX_TABLE_ROWS = 60; // cap a long list-table (e.g. a month of deaths)
const MAX_TABLE_COLS = 6;
// Table columns that are references, not content (dropped). Covers the supported
// languages' "source/references/notes" header words.
const REF_COLUMN_HEADER =
  /^(source|sources|référ|reference|ref\.?|réf\.?|notes?|fuente|quelle|fonte|bron|źródło|источник|πηγή|出典|参考|出処|출처|kaynak)/i;

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
  /infobox|navbox|reference|hatnote|metadata|mw-empty-elt|thumb|gallery|ambox|sidebar|noprint|mbox|toc|chronologie|boite-grise/i;
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
  const flow = root.querySelectorAll("h2, h3, h4, p, li, pre, figure, table.wikitable, .loupe");

  const sections: ArticleSection[] = [];
  let current: ArticleSection = { id: "section-0", title: leadTitle, level: 2, paragraphs: [] };
  // Whether the current h2 (and so its sub-headings) is an excluded section.
  let excludedH2 = false;
  // Whether the current heading's content should be skipped.
  let skip = false;

  const flush = (force = false) => {
    if (
      force ||
      current.paragraphs.length ||
      current.images?.length ||
      current.tables?.length ||
      current.mainLinks?.length
    ) {
      sections.push(current);
    }
  };

  for (const node of flow) {
    const tag = node.rawTagName?.toLowerCase();
    // {{Article détaillé}} pointer to a dedicated page (e.g. "Naissances en
    // 1950") — keep it visible so sections that only link elsewhere still show.
    if ((node.getAttribute("class") ?? "").includes("loupe")) {
      if (!skip) {
        const links = extractWikiLinks(node);
        if (links.length) {
          (current.mainLinks ??= []).push(...links);
        }
      }
      continue;
    }
    if (tag === "h2" || tag === "h3" || tag === "h4") {
      const incomingLevel = tag === "h2" ? 2 : tag === "h3" ? 3 : 4;
      // Keep an empty top-level heading that parents sub-sections, so big
      // categories whose text lives entirely in sub-sections (e.g. "Biographie",
      // "Carrière") stay visible in the body and the table of contents.
      const keepEmptyParent = !skip && current.level <= 2 && incomingLevel > 2;
      flush(keepEmptyParent);
      const title = collapseWhitespace(node.text).trim();
      if (tag === "h2") {
        excludedH2 = isExcludedSection(title);
        skip = excludedH2;
      } else {
        skip = excludedH2 || isExcludedSection(title);
      }
      current = { id: `section-${sections.length + 1}`, title, level: incomingLevel, paragraphs: [] };
    } else if (!skip && (tag === "p" || tag === "li" || tag === "pre") && isContentNode(node)) {
      if (current.paragraphs.length >= MAX_PARAGRAPHS_PER_SECTION) {
        continue;
      }
      // node-html-parser keeps <pre> content as raw text, so re-parse its HTML
      // to recover the inner elements (link lists in the "sigles" pages).
      const source = tag === "pre" ? parse(node.innerHTML) : node;
      const runs = normalizeRuns(buildRuns(source, tag === "li"));
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
    } else if (!skip && tag === "table" && isContentNode(node)) {
      // Content tables (e.g. the per-month list on a "Deaths in 2026" page).
      const table = buildTable(node);
      if (table) {
        (current.tables ??= []).push(table);
      }
    }
  }
  flush();

  return sections.filter((s) => s.title.length > 0 || s.id === "section-0").slice(0, MAX_SECTIONS);
}

/** Distinct internal WikiLinks inside an element (e.g. a {{Article détaillé}}). */
function extractWikiLinks(el: HTMLElement): ArticleLink[] {
  const seen = new Set<string>();
  const links: ArticleLink[] = [];
  for (const a of el.querySelectorAll("a")) {
    const rel = a.getAttribute("rel") ?? "";
    const href = a.getAttribute("href") ?? "";
    const label = collapseWhitespace(a.text).trim();
    if (!rel.includes("mw:WikiLink") || !href.startsWith("./") || !label) {
      continue;
    }
    // Keep namespaced targets here (a {{Catégorie détaillée}} points to a
    // Category: page) — the UI opens those on Wikipedia.
    const targetId = decodeURIComponent(href.slice(2).split("#")[0]);
    if (seen.has(targetId)) {
      continue;
    }
    seen.add(targetId);
    links.push({ label, targetId });
  }
  return links;
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

// Media-file namespaces (across the supported languages) — these link to images
// or audio, not articles, so they're rendered as plain text, not tappable links.
const MEDIA_NAMESPACE =
  /^(file|image|media|fichier|média|datei|imagen|immagine|imagem|bestand|plik|файл|αρχείο|ファイル|文件|파일|dosya):/i;

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
      // Drop small page chrome (pronunciation "Écouter ⓘ" widget, edit links…).
      if (isInlineAnnotation(el)) {
        continue;
      }
      if (tag === "sup") {
        // Drop citation markers ([1]) and any superscript holding a link, but
        // keep short ordinal superscripts (1er, 2e, XIXe…).
        if (el.querySelector("a") || /reference|mw-ref/i.test(el.getAttribute("class") ?? "")) {
          continue;
        }
        if (el.text.trim().length <= 4) {
          walk(el);
        }
        continue;
      }
      if (tag === "a") {
        const rel = el.getAttribute("rel") ?? "";
        const href = el.getAttribute("href") ?? "";
        const text = el.text;
        if (rel.includes("mw:WikiLink") && href.startsWith("./")) {
          const target = decodeURIComponent(href.slice(2).split("#")[0]);
          // Media namespaces (File:/Image:/Media:) are not articles → plain text.
          // Other namespaces (Category:/Portal:…) stay clickable: the app opens
          // them on Wikipedia.
          if (!text.trim() || MEDIA_NAMESPACE.test(target)) {
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

/** A single table cell's runs (so links inside the table stay tappable). */
function cellRuns(cell: HTMLElement): TableCell {
  return normalizeRuns(buildRuns(cell, false));
}

/**
 * Build a content table, resolving rowspans (e.g. a date cell that spans several
 * rows) into a full grid and dropping reference/source columns. Capped in size
 * so a long list page (a month of deaths) stays manageable in the feed.
 */
function buildTable(table: HTMLElement): ArticleTable | undefined {
  const trs = table.querySelectorAll("tr");
  if (trs.length < 2) {
    return undefined;
  }
  const headerCells = trs[0].querySelectorAll("th, td").filter((c) => c.parentNode === trs[0]);
  const headers = headerCells.map((c) => collapseWhitespace(c.text).trim());
  const colCount = Math.min(headers.length, MAX_TABLE_COLS);
  if (colCount < 2) {
    return undefined;
  }

  // Walk the data rows, carrying rowspanned cells forward so columns stay aligned.
  const active: ({ cell: TableCell; left: number } | null)[] = new Array(colCount).fill(null);
  const grid: TableCell[][] = [];
  for (let r = 1; r < trs.length && grid.length < MAX_TABLE_ROWS; r += 1) {
    const cells = trs[r].querySelectorAll("th, td").filter((c) => c.parentNode === trs[r]);
    if (!cells.length) {
      continue;
    }
    const row: TableCell[] = [];
    let ci = 0;
    for (let col = 0; col < colCount; col += 1) {
      const span = active[col];
      if (span) {
        row.push(span.cell);
        span.left -= 1;
        if (span.left <= 0) {
          active[col] = null;
        }
        continue;
      }
      const cell = cells[ci];
      ci += 1;
      if (!cell) {
        row.push([]);
        continue;
      }
      const runs = cellRuns(cell);
      row.push(runs);
      const rowspan = toInt(cell.getAttribute("rowspan"));
      if (rowspan && rowspan > 1) {
        active[col] = { cell: runs, left: rowspan - 1 };
      }
    }
    grid.push(row);
  }
  if (!grid.length) {
    return undefined;
  }

  // Keep content columns: drop reference/source columns and fully-empty ones.
  const keep: number[] = [];
  for (let col = 0; col < colCount; col += 1) {
    if (REF_COLUMN_HEADER.test(headers[col] ?? "")) {
      continue;
    }
    const hasContent =
      (headers[col] ?? "").length > 0 || grid.some((row) => (row[col]?.length ?? 0) > 0);
    if (hasContent) {
      keep.push(col);
    }
  }
  if (keep.length < 2) {
    return undefined;
  }

  return {
    headers: keep.map((col) => headers[col] ?? ""),
    rows: grid.map((row) => keep.map((col) => row[col] ?? [])),
  };
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

/** Count label/value (th+td) rows anywhere inside an element. */
function labelValueRowCount(el: HTMLElement): number {
  let n = 0;
  for (const tr of el.querySelectorAll("tr")) {
    if (tr.querySelector("th") && tr.querySelector("td")) {
      n += 1;
    }
  }
  return n;
}

// Year-range markers — these fill the chronology blocks of country infoboxes
// (regime lists by date, "President 1949–1959 → name"), which we drop from the
// at-a-glance card. Matched as a whole value, or anywhere in a row label.
const DATE_RANGE_VALUE = /^\s*\d{3,4}\s*[-–—]\s*\d{0,4}\s*$/;
const YEAR_RANGE_LABEL = /\b\d{3,4}\s*[-–—]\s*\d{2,4}\b/;

/**
 * Find the page's lead infobox element. Wikipedia ships several flavours:
 * old-style `table.infobox`/`taxobox` (species, films), and the modern
 * `div.infobox_v3` (countries, monuments) whose data lives in nested sub-tables.
 * A bare table with a "Données clés" caption (films) is matched too. We take the
 * first infobox-like element in document order (the lead), so secondary
 * infoboxes deeper in the body and large content wikitables don't win.
 */
function findInfobox(root: HTMLElement): HTMLElement | undefined {
  for (const el of root.querySelectorAll("table, div")) {
    const cls = el.getAttribute("class") ?? "";
    const caption = el.querySelector("caption")?.text?.toLowerCase() ?? "";
    const looksInfobox =
      /infobox|taxobox/i.test(cls) || /données clés|key data|fiche technique/i.test(caption);
    if (looksInfobox && labelValueRowCount(el) >= 2) {
      return el;
    }
  }
  return undefined;
}

/** Nearest ancestor <table> of a node (used to detect sub-table boundaries). */
function nearestTable(node: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = node.parentNode as HTMLElement | null;
  while (el && el.rawTagName) {
    if (el.rawTagName.toLowerCase() === "table") {
      return el;
    }
    el = el.parentNode as HTMLElement | null;
  }
  return null;
}

interface InfoboxBlock {
  heading?: string;
  rows: InfoboxRow[];
}

/**
 * Split an infobox into thematic blocks. A new block starts at a lone heading
 * cell (section title like "Caractéristiques physiques", or an office name) and
 * at each sub-table boundary (the modern v3 div groups themes into sub-tables).
 * This lets us sample a few facts per theme so a large infobox shows breadth
 * (geography + demographics + economy), not just its first block.
 */
function infoboxBlocks(el: HTMLElement): InfoboxBlock[] {
  const blocks: InfoboxBlock[] = [];
  let cur: InfoboxBlock = { rows: [] };
  let started = false;
  let lastTable: HTMLElement | null = null;
  let scanned = 0;

  const push = () => {
    if (cur.rows.length || cur.heading) {
      blocks.push(cur);
    }
    cur = { rows: [] };
  };

  for (const tr of el.querySelectorAll("tr")) {
    if (scanned >= MAX_INFOBOX_SCAN) {
      break;
    }
    scanned += 1;
    const cells = tr.querySelectorAll("th, td").filter((c) => c.parentNode === tr);
    if (!cells.length) {
      continue;
    }
    const table = nearestTable(tr);
    if (started && table !== lastTable) {
      push();
    }
    lastTable = table;
    started = true;

    // A lone heading cell gives the rows below it their context.
    if (cells.every((c) => c.rawTagName?.toLowerCase() === "th")) {
      const heading = cleanCellText(tr);
      push();
      if (heading && heading.length <= 80) {
        cur.heading = heading;
      }
      continue;
    }

    const th = tr.querySelector("th");
    const td = tr.querySelector("td");
    if (!th || !td) {
      continue; // image row (td only) or empty
    }
    const label = cleanCellText(th);
    const value = cleanCellText(td);
    if (!label || !value || label.length > 40 || value.length > 180) {
      continue;
    }
    cur.rows.push({ label, value });
  }
  push();
  return blocks;
}

/** A chronology block (regime list, year ranges) — noise for an at-a-glance card. */
function isTimelineBlock(block: InfoboxBlock): boolean {
  const n = block.rows.length;
  if (n < 2) {
    return false;
  }
  const ranges = block.rows.filter(
    (r) => DATE_RANGE_VALUE.test(r.value) || YEAR_RANGE_LABEL.test(r.label ?? ""),
  ).length;
  if (n >= 4) {
    return ranges / n >= 0.5;
  }
  // A short block keyed entirely by year ranges is a leaders/succession list
  // (e.g. "President 1949–1959 → name"), not at-a-glance facts.
  return ranges === n && block.rows.every((r) => YEAR_RANGE_LABEL.test(r.label ?? ""));
}

export function parseInfobox(html: string): ArticleInfobox | undefined {
  const root = parse(html, { comment: false });
  const el = findInfobox(root);
  if (!el) {
    return undefined;
  }

  let image: string | undefined;
  let imageWidth: number | undefined;
  let imageHeight: number | undefined;
  for (const img of el.querySelectorAll("img")) {
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

  // The first heading-less block is the page title row; empty blocks are dropped.
  let blocks = infoboxBlocks(el).filter((b) => b.rows.length > 0 && !isTimelineBlock(b));

  // For a person, drop the office/function blocks and keep only the "Biography"
  // facts (born/died/nationality…) — its own block, rendered without a heading.
  const bio = blocks.find((b) => b.heading && BIOGRAPHY_HEADINGS.has(b.heading.toLowerCase()));
  if (bio) {
    blocks = [{ rows: bio.rows }];
  }

  // One block → a focused card (person/species/film): keep its facts as-is.
  // Many blocks → a broad subject (country, star): sample a few facts per theme
  // so geography, demographics and economy all surface, not just the first block.
  const multi = blocks.length > 1;
  const rows: InfoboxRow[] = [];
  let kept = 0;
  for (const block of blocks) {
    if (kept >= MAX_INFOBOX_ROWS) {
      break;
    }
    if (multi && block.heading) {
      rows.push({ value: block.heading, heading: true });
    }
    const take = multi ? block.rows.slice(0, PER_BLOCK_ROWS) : block.rows;
    for (const row of take) {
      if (kept >= MAX_INFOBOX_ROWS) {
        break;
      }
      rows.push(row);
      kept += 1;
    }
  }

  // Drop a trailing heading left with no facts under it (cap reached mid-block).
  while (rows.length && rows[rows.length - 1].heading) {
    rows.pop();
  }

  if (!image && !rows.length) {
    return undefined;
  }
  return { image, imageWidth, imageHeight, rows };
}
