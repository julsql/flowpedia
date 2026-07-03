import type { TranslationKey } from "../i18n/config";

type Translate = (key: TranslationKey, opts?: Record<string, string | number>) => string;

/** Compact "posted X ago" label for a story's `createdAt` (ISO string).
 *  Buckets: <1min → now, <1h → minutes, <1d → hours, <1w → days, else weeks.
 *  `now` is injectable so the formatting is unit-testable. */
export function storyTimeAgo(iso: string, t: Translate, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMin = Math.max(0, Math.floor((now - then) / 60000));
  if (diffMin < 1) return t("story.postedNow");
  if (diffMin < 60) return t("story.postedMinutes", { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t("story.postedHours", { count: diffH });
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return t("story.postedDays", { count: diffD });
  return t("story.postedWeeks", { count: Math.floor(diffD / 7) });
}
