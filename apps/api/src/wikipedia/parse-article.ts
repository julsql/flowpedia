import { parse, type HTMLElement, type Node } from "node-html-parser";
import type { ArticleSection, TextRun } from "@flowpedia/shared";

const TEXT_NODE = 3;
const MAX_SECTIONS = 40;
const MAX_PARAGRAPHS_PER_SECTION = 80;

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
  const flow = root.querySelectorAll("h2, h3, h4, p, li");

  const sections: ArticleSection[] = [];
  let current: ArticleSection = { id: "section-0", title: leadTitle, paragraphs: [] };
  // Whether the current h2 (and so its sub-headings) is an excluded section.
  let excludedH2 = false;
  // Whether the current heading's content should be skipped.
  let skip = false;

  const flush = () => {
    if (current.paragraphs.length) {
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
      current = { id: `section-${sections.length + 1}`, title, paragraphs: [] };
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
      if (tag === "sup") {
        // Skip citation markers like [1]; keep other superscripts as text.
        if (/reference|mw-ref/i.test(el.getAttribute("class") ?? "")) {
          continue;
        }
        walk(el);
      } else if (tag === "a") {
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
