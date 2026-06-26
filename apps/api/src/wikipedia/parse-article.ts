import { parse, type HTMLElement, type Node } from "node-html-parser";
import type { ArticleSection, TextRun } from "@flowpedia/shared";

const TEXT_NODE = 3;
const MAX_SECTIONS = 12;

// Wrappers whose paragraphs are chrome, not article prose.
const SKIP_ANCESTOR_CLASS =
  /infobox|navbox|reference|hatnote|metadata|mw-empty-elt|thumb|gallery|ambox|sidebar|noprint|mbox/i;
const SKIP_ANCESTOR_TAG = new Set(["figure", "table", "ol", "ul", "style", "sup"]);

/**
 * Parse Parsoid/Wikipedia article HTML into clean sections of paragraphs,
 * preserving internal links as runs (the rabbit-hole mechanism). Reference
 * lists, infoboxes and other chrome are dropped. `leadTitle` labels the
 * intro section (it has no heading in the source).
 */
export function parseArticleSections(html: string, leadTitle: string): ArticleSection[] {
  const root = parse(html, { comment: false });
  const flow = root.querySelectorAll("h2, h3, p");

  const sections: ArticleSection[] = [];
  let current: ArticleSection = { id: "section-0", title: leadTitle, paragraphs: [] };

  for (const node of flow) {
    const tag = node.rawTagName?.toLowerCase();
    if (tag === "h2" || tag === "h3") {
      if (current.paragraphs.length) {
        sections.push(current);
      }
      const title = collapseWhitespace(node.text).trim();
      current = { id: `section-${sections.length + 1}`, title, paragraphs: [] };
    } else if (tag === "p" && isContentParagraph(node)) {
      const runs = normalizeRuns(buildRuns(node));
      if (runs.length) {
        current.paragraphs.push({ runs });
      }
    }
  }
  if (current.paragraphs.length) {
    sections.push(current);
  }

  return sections.filter((s) => s.title.length > 0 || s.id === "section-0").slice(0, MAX_SECTIONS);
}

/** Collect distinct internal links across sections (for "keep exploring" UIs). */
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

function isContentParagraph(p: HTMLElement): boolean {
  let el: HTMLElement | null = p.parentNode as HTMLElement | null;
  while (el && el.rawTagName) {
    if (SKIP_ANCESTOR_TAG.has(el.rawTagName.toLowerCase())) {
      return false;
    }
    if (SKIP_ANCESTOR_CLASS.test(el.getAttribute("class") ?? "")) {
      return false;
    }
    el = el.parentNode as HTMLElement | null;
  }
  return true;
}

function buildRuns(paragraph: HTMLElement): TextRun[] {
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
