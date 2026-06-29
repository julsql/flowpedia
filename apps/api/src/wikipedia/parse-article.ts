import { parse, type HTMLElement, type Node } from "node-html-parser";
import type {
  AncestryEntry,
  ArticleChart,
  ArticleInfobox,
  ArticleLink,
  ArticleLocatorMap,
  ArticleSection,
  ArticleTable,
  ChartSlice,
  InfoboxRow,
  TableCell,
  TextRun,
} from "@flowpedia/shared";

const TEXT_NODE = 3;
// The mobile article body is virtualized (FlashList), so sections/paragraphs are
// mounted lazily — these are just generous backstops against pathological pages,
// not performance limits.
const MAX_SECTIONS = 500;
const MAX_PARAGRAPHS_PER_SECTION = 200;
const MAX_INFOBOX_ROWS = 16; // total label/value rows kept (headings not counted)
const PER_BLOCK_ROWS = 3; // facts kept per theme when an infobox spans many blocks
const MAX_INFOBOX_SCAN = 140; // scan deep enough across a multi-table (v3) infobox
const MIN_SECTION_IMAGE_WIDTH = 100; // skip tiny inline icons/flags
const MAX_TABLE_ROWS = 1000; // generous cap for long list-tables (a month of deaths is ~250 rows)
const MAX_TABLE_COLS = 24; // keep wide tables (electoral results, results grids) intact
const MIN_CELL_IMAGE_WIDTH = 30; // skip tiny inline icons (✓, flags) in table cells
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
    // bibliography / further reading (sources, not article prose)
    "bibliographie",
    "bibliography",
    "bibliografía",
    "bibliografia",
    "bibliografie",
    "literatur",
    "literatuur",
    "библиография",
    "литература",
    "βιβλιογραφία",
    "参考书目",
    "参考書目",
    "参考図書",
    "참고 자료",
    "참고자료",
    "further reading",
    "lectures complémentaires",
    "pour approfondir",
    "lectura adicional",
    "letture",
    "leitura adicional",
    "verder lezen",
    "dalsze czytanie",
    "ek okuma",
    "ek okumalar",
    // "related articles" (often a standalone section, not under "see also")
    "articles connexes",
    "related articles",
    "related pages",
    "artículos relacionados",
    "voci correlate",
    "artigos relacionados",
    "gerelateerde artikelen",
    "powiązane artykuły",
    "связанные статьи",
    "σχετικά άρθρα",
    "相关条目",
    "相關條目",
    "관련 문서",
    "ilgili maddeler",
  ].map((s) => s.toLowerCase()),
);

// Section titles whose links seed "keep exploring" (related articles, see also).
const RELATED_SECTION_TITLES = new Set<string>(
  [
    "articles connexes",
    "voir aussi",
    "related articles",
    "see also",
    "voci correlate",
    "véase también",
    "siehe auch",
    "ver também",
    "zie ook",
    "zobacz też",
    "см. также",
    "관련 문서",
    "関連項目",
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
        // Remember how many paragraphs came before it, to place it inline.
        (current.images ??= []).push({ ...image, afterParagraph: current.paragraphs.length });
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

/**
 * Collect the internal links from the "Articles connexes" / "See also" sections,
 * to seed "keep exploring" (those sections are hidden in the body). Document
 * order, so a heading toggles whether following list items count.
 */
export function parseRelatedLinks(html: string): ArticleLink[] {
  const root = parse(html, { comment: false });
  const seen = new Set<string>();
  const links: ArticleLink[] = [];
  let inRelated = false;
  for (const node of root.querySelectorAll("h2, h3, h4, li")) {
    const tag = node.rawTagName?.toLowerCase() ?? "";
    if (tag === "h2" || tag === "h3" || tag === "h4") {
      inRelated = RELATED_SECTION_TITLES.has(collapseWhitespace(node.text).trim().toLowerCase());
      continue;
    }
    if (!inRelated) {
      continue;
    }
    for (const a of node.querySelectorAll("a")) {
      const rel = a.getAttribute("rel") ?? "";
      const href = a.getAttribute("href") ?? "";
      const label = collapseWhitespace(a.text).trim();
      if (!rel.includes("mw:WikiLink") || !href.startsWith("./") || !label) {
        continue;
      }
      const targetId = decodeURIComponent(href.slice(2).split("#")[0]);
      if (targetId.includes(":") || seen.has(targetId)) {
        continue;
      }
      seen.add(targetId);
      links.push({ label, targetId });
    }
  }
  return links.slice(0, 12);
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

// Unicode super/subscript glyphs for short ordinals (2ᵉ, 1ᵉʳ) and formulae
// (H₂O). Characters with no script form are left unchanged.
const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷",
  "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "(": "⁽", ")": "⁾",
  a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ", h: "ʰ", i: "ⁱ", j: "ʲ",
  k: "ᵏ", l: "ˡ", m: "ᵐ", n: "ⁿ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ", t: "ᵗ", u: "ᵘ",
  v: "ᵛ", w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ",
};
const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇",
  "8": "₈", "9": "₉", "+": "₊", "-": "₋", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ",
  p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
};

/** Convert short sup/sub text to Unicode super/subscript glyphs (best effort). */
function toUnicodeScript(text: string, superscript: boolean): string {
  const map = superscript ? SUPERSCRIPT : SUBSCRIPT;
  return [...text].map((ch) => map[ch.toLowerCase()] ?? ch).join("");
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
      // A line break separates stacked values (e.g. a table cell's "name" and
      // its "dates", or several notable films) — keep it as a newline instead of
      // gluing the parts together.
      if (tag === "br") {
        pushText(runs, "\n");
        continue;
      }
      // Drop small page chrome (pronunciation "Écouter ⓘ" widget, edit links…).
      if (isInlineAnnotation(el)) {
        continue;
      }
      if (tag === "sup" || tag === "sub") {
        // Drop citation markers ([1]) and any superscript holding a link, but
        // keep short ordinal superscripts (1er, 2e, XIXe…) / subscripts (H₂O) —
        // rendered as Unicode super/subscript so they read as raised/lowered
        // glyphs everywhere (RN <Text> can't truly offset them).
        if (el.querySelector("a") || /reference|mw-ref/i.test(el.getAttribute("class") ?? "")) {
          continue;
        }
        if (el.text.trim().length <= 4) {
          pushText(runs, toUnicodeScript(el.text, tag === "sup"));
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
        const swatch = swatchColor(el);
        if (swatch) {
          runs.push({ text: "", swatch }); // legend colour key → coloured square
        } else {
          walk(el); // i, b, span, etc. → flatten to text/links
        }
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

// Editorial maintenance markers Wikipedia inlines in brackets ("[réf. souhaitée]",
// "[citation needed]", "[Quand ?]"…). Noise for a reader — stripped from prose.
const EDITORIAL_MARKER =
  /\s*\[\s*(?:réf\.?[^\]]*|citation needed|citation nécessaire|pas clair|quand\s*\??|qui\s*\??|combien\s*\??|où\s*\??|évasif|passage évasif|précision nécessaire|incompréhensible|interprétation personnelle|style à revoir|non neutre|source insuffisante|source détournée|selon qui\s*\??|when\?|who\?|clarification needed|dubious|page needed)\s*\]/gi;

/**
 * An inline colour swatch (legend key): a small `display:inline-block` span with
 * a background colour and no text (the label follows it). We keep its colour so
 * the app can draw the square — otherwise the legend is just unexplained words.
 */
function swatchColor(el: HTMLElement): string | undefined {
  if (el.rawTagName?.toLowerCase() !== "span") {
    return undefined;
  }
  const style = el.getAttribute("style") ?? "";
  if (!/display\s*:\s*inline-block/i.test(style) || el.text.trim()) {
    return undefined;
  }
  const m = style.match(/background(?:-color)?\s*:\s*([^;]+)/i);
  const color = m?.[1]?.trim();
  if (!color || /transparent|inherit|none|var\(|url\(|gradient/i.test(color)) {
    return undefined;
  }
  return color;
}

/** Collapse whitespace, merge adjacent plain runs, trim edges, drop empties. */
function normalizeRuns(runs: TextRun[]): TextRun[] {
  const merged: TextRun[] = [];
  for (const run of runs) {
    if (run.swatch) {
      merged.push({ text: "", swatch: run.swatch }); // keep legend colour keys
      continue;
    }
    // Collapse spaces/tabs but PRESERVE newlines (intentional <br> separators).
    const text = run.text.replace(/[^\S\n]+/g, " ").replace(EDITORIAL_MARKER, "");
    if (!text) {
      continue;
    }
    const last = merged[merged.length - 1];
    // Don't merge into/through a swatch run, or its label ("Gagnant") would be
    // absorbed and then hidden (the swatch renders as a square, ignoring text).
    if (last && !last.linkTargetId && !last.swatch && !run.linkTargetId) {
      last.text += text;
    } else {
      merged.push({ text, ...(run.linkTargetId ? { linkTargetId: run.linkTargetId } : {}) });
    }
  }
  // Tidy whitespace left by stripped markers/dropped chrome: a removed
  // "[réf. souhaitée]" (often preceded by a non-breaking space) can leave a
  // double space or a space before punctuation. Newlines are kept (and any
  // surrounding spaces / runs of blank lines are squeezed out).
  for (const r of merged) {
    r.text = r.text
      .replace(/[^\S\n]{2,}/g, " ")
      .replace(/[^\S\n]+([,.…)\]»])/g, "$1")
      .replace(/ *\n */g, "\n")
      .replace(/\n{2,}/g, "\n");
  }
  for (let i = 1; i < merged.length; i += 1) {
    if (/\s$/.test(merged[i - 1].text) && /^\s/.test(merged[i].text)) {
      merged[i].text = merged[i].text.replace(/^\s+/, "");
    }
  }
  if (merged.length) {
    merged[0].text = merged[0].text.replace(/^\s+/, "");
    merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/\s+$/, "");
  }
  return merged.filter((r) => r.text.length > 0 || r.swatch);
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

// Chart scaffolds (e.g. the empty pie-chart frame, on which Wikipedia overlays
// the data via CSS) render as a meaningless black circle — never use them as an
// article/infobox image.
const SCAFFOLD_IMAGE = /Circle_frame|Pie_chart_blank|Blank(_|%20)?map/i;

/** Whether an image src is a non-photo chart scaffold we should ignore. */
export function isScaffoldImage(src: string | undefined): boolean {
  return !!src && SCAFFOLD_IMAGE.test(src);
}

/**
 * Reconstruct Wikipedia CSS pie charts (an empty Circle_frame with CSS-overlaid
 * slices — not a real image) into structured data, so the app can draw them.
 * The slices come from the legend list next to the frame: a colored swatch + a
 * label + a percentage.
 */
export function parseCharts(html: string): ArticleChart[] {
  const root = parse(html, { comment: false });
  const charts: ArticleChart[] = [];
  const seen = new Set<string>();

  for (const img of root.querySelectorAll("img")) {
    if (!/Circle_frame/i.test(img.getAttribute("src") ?? "")) {
      continue;
    }
    // Climb to the container that also holds the legend list.
    let box: HTMLElement | null = img.parentNode as HTMLElement | null;
    let depth = 0;
    while (box && box.rawTagName && depth < 6 && !box.querySelector("ul li, ol li")) {
      box = box.parentNode as HTMLElement | null;
      depth += 1;
    }
    const list = box?.querySelector("ul, ol");
    if (!list) {
      continue;
    }

    const slices: ChartSlice[] = [];
    for (const li of list.querySelectorAll("li")) {
      const swatch = li.querySelector("span[style]");
      const color = (swatch?.getAttribute("style") ?? "")
        .match(/background(?:-color)?:\s*([^;]+)/i)?.[1]
        ?.trim();
      const text = collapseWhitespace(li.text);
      const pct = text.match(/([\d]+(?:[.,]\d+)?)\s*%/);
      if (!color || !pct) {
        continue;
      }
      const value = Number.parseFloat(pct[1].replace(",", "."));
      const label = text.replace(/\(?\s*[\d.,]+\s*%\s*\)?\s*$/, "").trim();
      if (!label || !Number.isFinite(value)) {
        continue;
      }
      slices.push({ label, value, color });
    }

    if (slices.length >= 2) {
      const key = slices.map((s) => `${s.label}:${s.value}`).join("|");
      if (!seen.has(key)) {
        seen.add(key);
        const captionEl = box?.querySelector(".thumbcaption");
        // Strip the embedded legend list (ul/ol) and CSS so the title is just
        // the chart's caption, not a dump of every slice (the legend is shown
        // separately under the chart).
        captionEl?.querySelectorAll("style, script, ul, ol").forEach((s) => s.remove());
        const caption = captionEl ? collapseWhitespace(captionEl.text).trim() : "";
        charts.push({ title: caption || undefined, slices });
      }
    }
  }
  return charts.slice(0, 4);
}

/** Resolve a Parsoid image src (often protocol-relative) to an https URL. */
function resolveImageUrl(src: string | undefined): string | undefined {
  if (!src || isScaffoldImage(src)) {
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

/** Extract a cell's background colour from `bgcolor` or an inline style. */
function cellBackground(cell: HTMLElement): string | undefined {
  const bgcolor = cell.getAttribute("bgcolor");
  if (bgcolor) {
    return bgcolor.trim();
  }
  const style = cell.getAttribute("style") ?? "";
  const match = style.match(/background(?:-color)?\s*:\s*([^;]+)/i);
  const color = match?.[1]?.trim();
  // Ignore "transparent"/"inherit" and gradients/urls — keep plain colours only.
  if (color && !/transparent|inherit|none|url\(|gradient/i.test(color)) {
    return color;
  }
  return undefined;
}

/** First non-tiny image inside a cell (e.g. a participant photo). */
function cellImage(cell: HTMLElement): string | undefined {
  for (const img of cell.querySelectorAll("img")) {
    const width = toInt(img.getAttribute("width"));
    if (width !== undefined && width < MIN_CELL_IMAGE_WIDTH) {
      continue;
    }
    const url = resolveImageUrl(img.getAttribute("src"));
    if (url) {
      return url;
    }
  }
  return undefined;
}

/** A single table cell: tappable-link runs + optional image and background. */
function buildCell(cell: HTMLElement): TableCell {
  const runs = normalizeRuns(buildRuns(cell, false));
  const image = cellImage(cell);
  const background = cellBackground(cell);
  return { runs, ...(image ? { image } : {}), ...(background ? { background } : {}) };
}

interface RawCell {
  cell: TableCell;
  text: string;
  isHeader: boolean;
}

const MAX_COLSPAN = 30; // guard against malformed colspan blowing up the grid

/**
 * Expand a table into a full rectangular matrix, resolving BOTH colspan and
 * rowspan so every logical column lines up — even with multi-row headers (e.g.
 * an electoral table whose "1er tour" header spans the "Voix"/"%" sub-columns).
 */
function tableMatrix(table: HTMLElement): RawCell[][] {
  const trs = table.querySelectorAll("tr");
  const matrix: RawCell[][] = [];
  // Cells still spanning down into later rows, keyed by absolute column index.
  const carry: ({ cell: RawCell; rowsLeft: number } | undefined)[] = [];
  const rowCap = MAX_TABLE_ROWS + 4; // a few extra rows for multi-line headers

  for (let r = 0; r < trs.length && matrix.length < rowCap; r += 1) {
    const cells = trs[r].querySelectorAll("th, td").filter((c) => c.parentNode === trs[r]);
    if (!cells.length && !carry.some(Boolean)) {
      continue;
    }
    const row: RawCell[] = [];
    let col = 0;
    const placeCarries = () => {
      while (carry[col]) {
        const c = carry[col]!;
        row[col] = c.cell;
        c.rowsLeft -= 1;
        if (c.rowsLeft <= 0) {
          carry[col] = undefined;
        }
        col += 1;
      }
    };

    for (const cell of cells) {
      placeCarries();
      const built = buildCell(cell);
      const raw: RawCell = {
        cell: built,
        text: built.runs.map((x) => x.text).join(""),
        isHeader: cell.rawTagName?.toLowerCase() === "th",
      };
      const colspan = Math.min(Math.max(toInt(cell.getAttribute("colspan")) ?? 1, 1), MAX_COLSPAN);
      const rowspan = Math.max(toInt(cell.getAttribute("rowspan")) ?? 1, 1);
      for (let k = 0; k < colspan; k += 1) {
        row[col] = raw;
        if (rowspan > 1) {
          carry[col] = { cell: raw, rowsLeft: rowspan - 1 };
        }
        col += 1;
      }
    }
    placeCarries(); // trailing rowspans past the last cell
    matrix.push(row);
  }
  return matrix;
}

/**
 * Build a content table from its matrix: flatten a possibly multi-row header
 * (joining each column's header levels, e.g. "1er tour · Voix"), then the data
 * rows, dropping reference/source and fully-empty columns. Capped so a long list
 * page (a month of deaths) stays manageable in the feed.
 */
function buildTable(table: HTMLElement): ArticleTable | undefined {
  const matrix = tableMatrix(table);
  if (matrix.length < 2) {
    return undefined;
  }
  const cols = Math.min(MAX_TABLE_COLS, Math.max(...matrix.map((row) => row.length)));
  if (cols < 2) {
    return undefined;
  }

  // Header rows = the leading run of rows whose cells are all <th>.
  let headerRows = 0;
  for (const row of matrix) {
    const present = row.filter(Boolean);
    if (present.length && present.every((c) => c.isHeader)) {
      headerRows += 1;
    } else {
      break;
    }
  }
  if (headerRows === 0 || headerRows >= matrix.length) {
    headerRows = 1; // no clear header band → treat the first row as the header
  }

  // Flatten each column's header levels into one label (deduped, top to bottom).
  const headers: string[] = [];
  for (let c = 0; c < cols; c += 1) {
    const parts: string[] = [];
    for (let r = 0; r < headerRows; r += 1) {
      const text = matrix[r]?.[c]?.text.trim() ?? "";
      if (text && !parts.includes(text)) {
        parts.push(text);
      }
    }
    headers.push(parts.join(" · "));
  }

  const empty: TableCell = { runs: [] };
  const grid: TableCell[][] = [];
  for (let r = headerRows; r < matrix.length && grid.length < MAX_TABLE_ROWS; r += 1) {
    const row = matrix[r];
    if (!row || !row.some(Boolean)) {
      continue;
    }
    grid.push(Array.from({ length: cols }, (_, c) => row[c]?.cell ?? empty));
  }
  if (!grid.length) {
    return undefined;
  }

  // Keep content columns: drop reference/source columns and fully-empty ones.
  // A column counts as content if any cell has text, an image, or a background
  // colour (so the colour-coded grid columns are never dropped as "empty").
  const cellHasContent = (cell: TableCell) =>
    cell.runs.length > 0 || cell.image !== undefined || cell.background !== undefined;
  const keep: number[] = [];
  for (let col = 0; col < cols; col += 1) {
    if (REF_COLUMN_HEADER.test(headers[col] ?? "")) {
      continue;
    }
    if ((headers[col] ?? "").length > 0 || grid.some((row) => cellHasContent(row[col] ?? empty))) {
      keep.push(col);
    }
  }
  if (keep.length < 2) {
    return undefined;
  }

  return {
    headers: keep.map((col) => headers[col] ?? ""),
    rows: grid.map((row) => keep.map((col) => row[col] ?? empty)),
  };
}

/**
 * Clean visible text of an element (drop citation markers, collapse spaces).
 * Line breaks (<br>) and list items become newlines, so an infobox entry with
 * several values (e.g. "Films notables" → one per line) stays readable instead
 * of gluing them together.
 */
function cleanCellText(el: HTMLElement): string {
  for (const sup of el.querySelectorAll("sup")) {
    if (/reference|mw-ref/i.test(sup.getAttribute("class") ?? "")) {
      sup.remove();
    }
  }
  const parts: string[] = [];
  const walk = (node: Node): void => {
    for (const child of node.childNodes) {
      if (child.nodeType === TEXT_NODE) {
        parts.push(child.text);
        continue;
      }
      const e = child as HTMLElement;
      const tag = e.rawTagName?.toLowerCase();
      if (tag === "br") {
        parts.push("\n");
        continue;
      }
      if ((tag === "sup" || tag === "sub") && e.text.trim().length <= 4 && !e.querySelector("a")) {
        parts.push(toUnicodeScript(e.text, tag === "sup"));
        continue;
      }
      if (tag === "li") {
        parts.push("\n");
        walk(e);
        parts.push("\n");
        continue;
      }
      walk(e);
    }
  };
  walk(el);
  return parts
    .join("")
    .split("\n")
    .map((line) => collapseWhitespace(line).trim())
    .filter((line) => line.length > 0)
    .join("\n");
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
  let mapImage: string | undefined;
  let mapImageWidth: number | undefined;
  let mapImageHeight: number | undefined;
  let mapMarkerTop: number | undefined;
  let mapMarkerLeft: number | undefined;
  // Prefer the structured "Géolocalisation" pushpin boxes: they give us the base
  // map(s) AND each marker's position (a bare <img> scan can't — the pin is a
  // separate CSS-positioned overlay, so without it the map shows no point). A
  // page often offers several framings (country/region/département): keep them
  // all so the app can switch, with maps[0] mirrored into the singleton fields.
  let maps: ArticleLocatorMap[] = extractLocatorMaps(el);
  if (maps.length) {
    const first = maps[0];
    mapImage = first.image;
    mapImageWidth = first.width;
    mapImageHeight = first.height;
    mapMarkerTop = first.markerTop;
    mapMarkerLeft = first.markerLeft;
  }
  // Base maps already taken from the pushpin boxes — never reuse them as the
  // lead image (a commune with no photo would otherwise show a map as its lead).
  const mapImageUrls = new Set(maps.map((m) => m.image));
  for (const img of el.querySelectorAll("img")) {
    const width = toInt(img.getAttribute("width"));
    if (width !== undefined && width < 60) {
      continue; // skip tiny icons (arrows, rating stars…)
    }
    const url = resolveImageUrl(img.getAttribute("src"));
    if (!url || mapImageUrls.has(url)) {
      continue;
    }
    // A locator/position map (region highlighted within its country) — kept
    // separately from the lead image so the app can show "where is this".
    if (!mapImage && isLocatorMapImage(img.getAttribute("resource") ?? url)) {
      mapImage = url;
      mapImageWidth = width;
      mapImageHeight = toInt(img.getAttribute("height"));
      continue;
    }
    if (!image) {
      image = url;
      imageWidth = width;
      imageHeight = toInt(img.getAttribute("height"));
    }
    if (image && mapImage) {
      break;
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
  // Generic fallback (no pushpin box, just a "…-Position.svg" image): expose it
  // as a single, markerless map so the switcher logic has a uniform shape.
  if (!maps.length && mapImage) {
    maps = [{ image: mapImage, width: mapImageWidth, height: mapImageHeight }];
  }
  // Never surface the same file twice (lead image == a locator map).
  maps = maps.filter((m) => m.image !== image);
  // Re-sync the singleton fields with the (possibly filtered) first map.
  const lead = maps[0];
  mapImage = lead?.image;
  mapImageWidth = lead?.width;
  mapImageHeight = lead?.height;
  mapMarkerTop = lead?.markerTop;
  mapMarkerLeft = lead?.markerLeft;
  return {
    image,
    imageWidth,
    imageHeight,
    mapImage,
    mapImageWidth,
    mapImageHeight,
    mapMarkerTop,
    mapMarkerLeft,
    maps: maps.length ? maps : undefined,
    rows,
  };
}

/** Read a `top`/`left` percentage from an inline style (`calc(NN% - 8px)` too). */
function stylePercent(style: string, prop: "top" | "left"): number | undefined {
  const m = style.match(new RegExp(`${prop}\\s*:\\s*(?:calc\\(\\s*)?(-?[0-9.]+)%`, "i"));
  if (!m) {
    return undefined;
  }
  const v = Number.parseFloat(m[1]);
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : undefined;
}

/**
 * Read one "Géolocalisation sur la carte" pushpin box: a base map image plus a
 * place marker positioned over it via absolute CSS (top/left in %). We keep the
 * base map, the marker's coordinates (so the app can redraw the dot — otherwise
 * the map shows a country with no point on it) and the area label.
 */
function readLocatorBox(box: HTMLElement): ArticleLocatorMap | undefined {
  // Base map = the first non-tiny image in the box (the pin image is ~20px).
  let base: HTMLElement | undefined;
  for (const img of box.querySelectorAll("img")) {
    const width = toInt(img.getAttribute("width"));
    if (width === undefined || width >= 60) {
      base = img;
      break;
    }
  }
  const image = base && resolveImageUrl(base.getAttribute("src"));
  if (!base || !image) {
    return undefined;
  }
  // Marker = an absolutely-positioned overlay carrying top/left percentages.
  let markerTop: number | undefined;
  let markerLeft: number | undefined;
  for (const div of box.querySelectorAll("div")) {
    const style = div.getAttribute("style") ?? "";
    if (!/position\s*:\s*absolute/i.test(style)) {
      continue;
    }
    const top = stylePercent(style, "top");
    const left = stylePercent(style, "left");
    if (top !== undefined && left !== undefined) {
      markerTop = top;
      markerLeft = left;
      break;
    }
  }
  // Label = the area name in "Géolocalisation sur la carte : <area>".
  const small = box.querySelector("small");
  let label = small?.querySelector("a")?.text?.trim();
  if (!label && small) {
    const txt = collapseWhitespace(small.text);
    const colon = txt.lastIndexOf(":");
    label = colon >= 0 ? txt.slice(colon + 1).trim() : undefined;
  }
  return {
    image,
    width: toInt(base.getAttribute("width")),
    height: toInt(base.getAttribute("height")),
    markerTop,
    markerLeft,
    label: label || undefined,
  };
}

/**
 * Extract every locator map the infobox offers (country, region, département…),
 * deduped by area label and image, so the app can let the user switch framing.
 */
function extractLocatorMaps(el: HTMLElement): ArticleLocatorMap[] {
  const out: ArticleLocatorMap[] = [];
  const seenLabel = new Set<string>();
  const seenImage = new Set<string>();
  for (const box of el.querySelectorAll(".geobox")) {
    const map = readLocatorBox(box);
    if (!map) {
      continue;
    }
    const key = (map.label ?? "").toLowerCase();
    // Keep the first map per area (a "relief" and an "administrative" France map
    // share the label) and never the same image twice.
    if ((key && seenLabel.has(key)) || seenImage.has(map.image)) {
      continue;
    }
    if (key) {
      seenLabel.add(key);
    }
    seenImage.add(map.image);
    out.push(map);
  }
  // A bare ".DebutCarte" without the ".geobox" wrapper (older markup).
  if (!out.length) {
    const box = el.querySelector(".DebutCarte");
    const map = box ? readLocatorBox(box) : undefined;
    if (map) {
      out.push(map);
    }
  }
  return out;
}

// Filenames of locator/position maps (a region shown within its country/world).
// Matched on the image's file name across the supported languages.
// `position`/`projection` must follow a non-letter so a diagram file like
// "Outersolarsystem_objectpositions_…" (or "composition") isn't mistaken for a
// locator map — only "_position", ":Position", "-projection"… count.
const LOCATOR_MAP_FILENAME =
  /(?<![a-z])position|locali[sz]ation|locator|location[_ -]?map|[_ -]map[_ -.]|carte|karte|mapa|mappa|kaart|harita|orthographic|(?<![a-z])projection|地図|地図|地图|지도|карт|χάρτ/i;

/** Whether an infobox image (by file name) is a locator/position map. */
function isLocatorMapImage(nameOrUrl: string): boolean {
  // Flags occasionally include "map"-ish words; never treat a flag as a map.
  if (/\bflag\b|drapeau|bandera|flagge|bandiera|vlag|flaga|флаг|σημαία|国旗|깃발|bayrak/i.test(nameOrUrl)) {
    return false;
  }
  return LOCATOR_MAP_FILENAME.test(nameOrUrl);
}

// An ahnentafel ("compact ancestors") cell: a leading number then a name, e.g.
// "8. Antoine de Bourbon". The number is the ahnentafel position (1 = the
// subject, 2 = father, 3 = mother, 4-7 = grandparents, 8-15 great-grandparents…).
const ANCESTRY_CELL = /^\s*(\d{1,3})\s*[.°:]\s*(\S.*)$/s;
const ANCESTRY_MAX_POSITION = 31; // up to great-great-grandparents (4 generations)
const ANCESTRY_MIN_ENTRIES = 6;

/** Extract numbered ancestor entries from a single ahnentafel-style table. */
function extractAncestry(table: HTMLElement): AncestryEntry[] {
  const byPosition = new Map<number, AncestryEntry>();
  for (const cell of table.querySelectorAll("td, th")) {
    // Only leaf cells (the compact-ancestors layout nests sub-tables).
    if (cell.querySelector("table")) {
      continue;
    }
    const text = collapseWhitespace(cell.text).trim();
    const match = text.match(ANCESTRY_CELL);
    if (!match) {
      continue;
    }
    const position = Number.parseInt(match[1], 10);
    if (!Number.isFinite(position) || position < 1 || position > 63 || byPosition.has(position)) {
      continue;
    }
    let targetId: string | undefined;
    let linkLabel: string | undefined;
    for (const a of cell.querySelectorAll("a")) {
      const rel = a.getAttribute("rel") ?? "";
      const href = a.getAttribute("href") ?? "";
      if (rel.includes("mw:WikiLink") && href.startsWith("./")) {
        const target = decodeURIComponent(href.slice(2).split("#")[0]);
        if (!target.includes(":")) {
          targetId = target;
          linkLabel = collapseWhitespace(a.text).trim() || undefined;
          break;
        }
      }
    }
    const label = (linkLabel ?? match[2]).replace(/^\s*\d{1,3}\s*[.°:]\s*/, "").trim();
    if (label) {
      byPosition.set(position, { position, label, ...(targetId ? { targetId } : {}) });
    }
  }
  const entries = [...byPosition.values()];
  // Qualify as an ahnentafel: enough entries AND a real depth (positions ≥ 8),
  // so a coincidental numbered list isn't mistaken for an ancestry chart.
  if (entries.length < ANCESTRY_MIN_ENTRIES || !entries.some((e) => e.position >= 8)) {
    return [];
  }
  return entries
    .filter((e) => e.position >= 2 && e.position <= ANCESTRY_MAX_POSITION)
    .sort((a, b) => a.position - b.position);
}

/**
 * Parse the "Ancestry" (ascendance) chart — Wikipedia's ahnentafel/"compact
 * ancestors" table — into a flat, numbered ancestor list the app groups by
 * generation. Returns [] when the page has no such chart.
 */
export function parseAncestry(html: string): AncestryEntry[] {
  const root = parse(html, { comment: false });
  for (const table of root.querySelectorAll("table")) {
    const entries = extractAncestry(table);
    if (entries.length) {
      return entries;
    }
  }
  return [];
}
