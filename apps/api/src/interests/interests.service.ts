import { Injectable } from "@nestjs/common";
import type { Interest } from "@flowpedia/shared";
import { WikipediaService } from "../wikipedia/wikipedia.service";

// Bound the work: only the most recent N kept articles feed the derivation.
const MAX_INPUT_ARTICLES = 40;
// A category must be shared by at least this many articles to count as a theme
// (one-off pages — and per-article noise like "Born in 1923" — never recur, so
// this single threshold filters the noise without locale-specific rules).
const MIN_COVERAGE = 2;
// How specific an interest is allowed to be: a precise category only "wins" over
// climbing to a generic ancestor when it still covers this share of the cluster.
// Below it (the cluster is spread across subjects), we climb to the ancestor that
// reunites them — French + Chinese medieval pages → "Moyen Âge" instead of two
// country-specific chips.
const SPECIFIC_FRACTION = 0.6;
// How many parent levels to climb when looking for a uniting ancestor. Dispersed
// clusters (medieval pages across France/China/Byzantium) only meet at a shared
// era/theme category several hops up, so we climb a few levels — cached, and only
// for categories that already recur, so the fan-out stays bounded.
const MAX_CLIMB_LEVELS = 3;
// Cap parent fetches per level so a big, varied library stays cheap.
const MAX_PARENT_FANOUT = 40;
const MAX_INTERESTS = 8;

// Biographical/temporal metadata categories ("Naissance en 1638", "Mort d'un
// cancer", "Personnalité du XVIIe siècle"…) recur across unrelated people, so the
// coverage threshold alone can't drop them — they'd masquerade as a shared theme.
// This catches the common forms across the main supported locales; less-common
// locales still get the year/century numeric guard below.
const NOISE_CATEGORY =
  /naissance|décès|deces|\bmort\b|\bmorts\b|\bné\b|\bnée\b|décédé|\bborn\b|\bdeath\b|\bdied\b|\bbirth\b|burial|enterré|sépulture|sepultur|geburt|geboren|gestorben|nacid|nacimiento|fallecid|muert|nato\b|nati\b|morto|nascita|nascido|falecid|doğum|ölüm|pseudonyme|nom de scène|nom de plume|élève|alumni|étudiant|personnalité|personnalit|centenari/i;

// Years (1638) and centuries ("XVIIe siècle", "17th century", "siglo XVII"…) make
// a category time-scoped rather than topical — drop anything carrying one.
const TIME_SCOPED =
  /\d{3,4}|\bs(?:iècle|iecle|ecolo|iglo|éculo|eculo)\b|century|jahrhundert|yüzyıl|\bвек\b|世紀|世纪|세기/i;

interface Coverage {
  /** Indices (into the input list) of the articles this category covers. */
  arts: Set<number>;
  /** Lowest level it appeared at (0 = direct on an article). Lower = more specific. */
  level: number;
}

/** A kept article with the weight of the signal it came from (liked ≫ saved ≫
 *  read). The weight steers the *ranking* of interests, not the recurrence gate:
 *  a theme still needs ≥ MIN_COVERAGE distinct articles, but among the surviving
 *  themes the one your strongest signals cluster on wins. */
export interface WeightedTitle {
  title: string;
  weight: number;
}

function toWeighted(input: string[] | WeightedTitle[]): WeightedTitle[] {
  return input.map((it) => (typeof it === "string" ? { title: it, weight: 1 } : it));
}

/**
 * Turns the titles a user kept (liked/read/saved) into adaptive interest chips.
 *
 * The granularity is *not* fixed: it follows how tightly the kept articles
 * cluster in Wikipedia's category graph. A focused run on French kings shares a
 * specific category ("Roi de France") → that becomes the interest. The same
 * pages spread across France, China and Byzantium share no specific category, so
 * the algorithm climbs to the ancestor that reunites them ("Moyen Âge"). The
 * label is the Wikipedia category name, already in the content language.
 */
@Injectable()
export class InterestsService {
  constructor(private readonly wikipedia: WikipediaService) {}

  async deriveInterests(
    input: string[] | WeightedTitle[],
    lang?: string,
  ): Promise<Interest[]> {
    // Dedupe by title (keeping the strongest weight when a page was e.g. both
    // liked and read), then keep the first N (highest-priority first).
    const byTitle = new Map<string, number>();
    for (const { title, weight } of toWeighted(input)) {
      if (!title) continue;
      byTitle.set(title, Math.max(byTitle.get(title) ?? 0, weight));
    }
    const kept = [...byTitle.entries()].slice(0, MAX_INPUT_ARTICLES);
    const articles = kept.map(([title]) => title);
    const weights = kept.map(([, weight]) => weight);
    if (articles.length < MIN_COVERAGE) {
      return [];
    }

    const coverage = new Map<string, Coverage>();
    const cover = (cat: string, artIdx: number, level: number) => {
      const entry = coverage.get(cat);
      if (entry) {
        entry.arts.add(artIdx);
        entry.level = Math.min(entry.level, level);
      } else {
        coverage.set(cat, { arts: new Set([artIdx]), level });
      }
    };

    // Level 0 — each article's own topical categories.
    const direct = await Promise.all(
      articles.map((title) => this.wikipedia.getTopicalCategories(title, lang)),
    );
    direct.forEach((cats, i) => cats.filter(isTopicalCategory).forEach((c) => cover(c, i, 0)));

    // Climb — for recurring categories only, pull parents and attribute their
    // coverage to the same articles, so a shared ancestor can outrank the
    // scattered specific categories when the cluster is dispersed.
    let frontier = [...coverage.keys()].filter((c) => coverage.get(c)!.arts.size >= MIN_COVERAGE);
    for (let level = 1; level <= MAX_CLIMB_LEVELS && frontier.length; level += 1) {
      const batch = frontier.slice(0, MAX_PARENT_FANOUT);
      const parentLists = await Promise.all(
        batch.map((cat) => this.wikipedia.getTopicalCategories(cat, lang)),
      );
      const next = new Set<string>();
      parentLists.forEach((parents, idx) => {
        const childArts = coverage.get(batch[idx])!.arts;
        for (const parent of parents.filter(isTopicalCategory)) {
          childArts.forEach((artIdx) => cover(parent, artIdx, level));
          if (coverage.get(parent)!.arts.size >= MIN_COVERAGE) {
            next.add(parent);
          }
        }
      });
      frontier = [...next];
    }

    return this.selectInterests(coverage, articles.length, weights);
  }

  /**
   * Greedy set-cover: repeatedly take the best category for the still-uncovered
   * articles, then remove the articles it explains so the next pick describes a
   * *different* cluster. Each pick prefers the most specific category that still
   * covers a large share of the remaining pool, only climbing when none does.
   */
  private selectInterests(
    coverage: Map<string, Coverage>,
    total: number,
    weights: number[],
  ): Interest[] {
    const remaining = new Set<number>(Array.from({ length: total }, (_, i) => i));
    const interests: Interest[] = [];
    const usedLabels = new Set<string>();
    const pool = new Map(coverage);
    const weightOf = (arts: Iterable<number>, onlyRemaining: boolean) => {
      let sum = 0;
      for (const i of arts) {
        if (!onlyRemaining || remaining.has(i)) sum += weights[i] ?? 1;
      }
      return sum;
    };

    while (remaining.size >= MIN_COVERAGE && interests.length < MAX_INTERESTS) {
      const scored = [...pool.entries()]
        .map(([cat, entry]) => ({
          cat,
          level: entry.level,
          total: entry.arts.size,
          // Recurrence is still counted in *distinct articles* (structural gate),
          // but ranking uses the *summed signal weight* so a cluster your likes
          // and bookmarks land on outranks a bigger one built only from history.
          inPool: [...entry.arts].filter((i) => remaining.has(i)).length,
          inWeight: weightOf(entry.arts, true),
        }))
        .filter((s) => s.inPool >= MIN_COVERAGE);
      if (!scored.length) {
        break;
      }

      // Breadth is measured in summed weight (not raw article count), so a theme
      // your likes/bookmarks concentrate on counts as "broad enough" ahead of a
      // larger cluster made only of lightly-weighted history. With uniform
      // weights this is identical to the previous article-count behaviour.
      const remainingWeight = weightOf(remaining, false);
      const need = Math.max(MIN_COVERAGE, Math.ceil(SPECIFIC_FRACTION * remainingWeight));
      const specific = scored.filter((s) => s.inWeight >= need);
      // Among broad-enough categories prefer the most specific (lowest level),
      // then the one your strongest signals cluster on (highest weight). If none
      // is broad enough, fall back to the heaviest-weighted coverage so a niche
      // but strongly-signalled leftover still surfaces.
      const pick =
        bestBy(
          specific,
          (a, b) => a.level - b.level || b.inWeight - a.inWeight || a.total - b.total,
        ) ??
        bestBy(
          scored,
          (a, b) => b.inWeight - a.inWeight || b.inPool - a.inPool || a.level - b.level,
        );
      if (!pick) {
        break;
      }

      const entry = pool.get(pick.cat)!;
      for (const idx of entry.arts) {
        remaining.delete(idx);
      }
      pool.delete(pick.cat);

      const label = stripCategoryPrefix(pick.cat);
      const labelKey = label.toLowerCase();
      if (label && !usedLabels.has(labelKey)) {
        usedLabels.add(labelKey);
        interests.push({ id: pick.cat, label });
      }
    }

    return interests;
  }
}

/** Pick the element ranked first by `cmp` (negative = `a` before `b`), or null. */
function bestBy<T>(items: T[], cmp: (a: T, b: T) => number): T | null {
  if (!items.length) {
    return null;
  }
  return items.reduce((best, item) => (cmp(item, best) < 0 ? item : best));
}

/** Keep only topical categories — drop biographical/temporal metadata noise. */
function isTopicalCategory(category: string): boolean {
  const name = stripCategoryPrefix(category);
  return name.length > 0 && !NOISE_CATEGORY.test(name) && !TIME_SCOPED.test(name);
}

/** "Catégorie:Roi de France" → "Roi de France" (any localized prefix). */
function stripCategoryPrefix(category: string): string {
  const colon = category.indexOf(":");
  return colon >= 0 ? category.slice(colon + 1).trim() : category.trim();
}
