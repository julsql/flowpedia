// Plural handling for every UI locale (i18next v4 JSON: `key_one`, `key_other`…).
// Runs twice: against the runtime's native Intl.PluralRules, and against the
// `intl-pluralrules` implementation the app falls back to on Hermes.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import i18next from "i18next";
import PolyfillPluralRules from "intl-pluralrules/plural-rules";

const localesDir = join(dirname(fileURLToPath(import.meta.url)), "locales");
const locales = Object.fromEntries(
  readdirSync(localesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(localesDir, f), "utf8"))]),
);
const LANGS = Object.keys(locales);
const PLURAL_RE = /^(.+)_(zero|one|two|few|many|other)$/;

function pluralBaseKeys(resource) {
  return [...new Set(Object.keys(resource).flatMap((k) => k.match(PLURAL_RE)?.[1] ?? []))];
}

async function createI18n(lng) {
  const instance = i18next.createInstance();
  await instance.init({
    resources: Object.fromEntries(LANGS.map((l) => [l, { translation: locales[l] }])),
    lng,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}

// Expected output for count = 0, 1 and 5 (the article reading-time label, the
// only plural key every locale translates).
const MIN_READ = {
  en: ["0 min read", "1 min read", "5 min read"],
  fr: ["lecture 0 min", "lecture 1 min", "lecture 5 min"],
  es: ["0 min de lectura", "1 min de lectura", "5 min de lectura"],
  de: ["0 Min. Lesezeit", "1 Min. Lesezeit", "5 Min. Lesezeit"],
  it: ["0 min di lettura", "1 min di lettura", "5 min di lettura"],
  pt: ["0 min de leitura", "1 min de leitura", "5 min de leitura"],
  nl: ["0 min lezen", "1 min lezen", "5 min lezen"],
  pl: ["0 min czytania", "1 min czytania", "5 min czytania"],
  ru: ["0 мин чтения", "1 мин чтения", "5 мин чтения"],
  el: ["0 λεπτά ανάγνωσης", "1 λεπτό ανάγνωσης", "5 λεπτά ανάγνωσης"],
  zh: ["阅读 0 分钟", "阅读 1 分钟", "阅读 5 分钟"],
  ja: ["読了 0 分", "読了 1 分", "読了 5 分"],
  ko: ["0분 읽기", "1분 읽기", "5분 읽기"],
  tr: ["0 dk okuma", "1 dk okuma", "5 dk okuma"],
};

// Plural category i18next must pick, per locale and count (CLDR cardinal rules).
const SUFFIXES = {
  en: { 0: "_other", 1: "_one", 5: "_other" },
  fr: { 0: "_one", 1: "_one", 2: "_other", 5: "_other" },
  es: { 0: "_other", 1: "_one", 5: "_other" },
  pt: { 0: "_one", 1: "_one", 5: "_other" },
  pl: { 0: "_many", 1: "_one", 2: "_few", 5: "_many", 22: "_few" },
  ru: { 0: "_many", 1: "_one", 2: "_few", 5: "_many", 21: "_one" },
  ja: { 0: "_other", 1: "_other", 5: "_other" },
};

describe("locale files", () => {
  it("covers every reference locale", () => {
    assert.deepEqual(
      LANGS.sort(),
      ["de", "el", "en", "es", "fr", "it", "ja", "ko", "nl", "pl", "pt", "ru", "tr", "zh"],
    );
  });

  for (const lang of LANGS) {
    it(`${lang}: no legacy single-form {{count}} key`, () => {
      const legacy = Object.entries(locales[lang]).filter(
        ([k, v]) => v.includes("{{count}}") && !PLURAL_RE.test(k),
      );
      assert.deepEqual(legacy, []);
    });

    it(`${lang}: every plural key defines all CLDR categories`, () => {
      const categories = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
      for (const base of pluralBaseKeys(locales[lang])) {
        for (const cat of categories) {
          assert.ok(`${base}_${cat}` in locales[lang], `${lang}: missing ${base}_${cat}`);
        }
      }
    });
  }
});

for (const [label, PluralRules] of [
  ["native Intl.PluralRules", Intl.PluralRules],
  ["intl-pluralrules (Hermes fallback)", PolyfillPluralRules],
]) {
  describe(`plurals with ${label}`, () => {
    const withPluralRules = (fn) => async () => {
      const original = Intl.PluralRules;
      Intl.PluralRules = PluralRules;
      try {
        await fn();
      } finally {
        Intl.PluralRules = original;
      }
    };

    for (const lang of LANGS) {
      it(
        `${lang}: article.minRead for 0 / 1 / n`,
        withPluralRules(async () => {
          const i18n = await createI18n(lang);
          const got = [0, 1, 5].map((count) => i18n.t("article.minRead", { count }));
          assert.deepEqual(got, MIN_READ[lang]);
        }),
      );
    }

    for (const [lang, cases] of Object.entries(SUFFIXES)) {
      it(
        `${lang}: picks the right plural category`,
        withPluralRules(async () => {
          const i18n = await createI18n(lang);
          for (const [count, suffix] of Object.entries(cases)) {
            assert.equal(
              i18n.services.pluralResolver.getSuffix(lang, Number(count)),
              suffix,
              `${lang} count=${count}`,
            );
          }
        }),
      );
    }

    it(
      "en: singular / plural wording",
      withPluralRules(async () => {
        const i18n = await createI18n("en");
        const liked = (count) => i18n.t("article.likedByMore", { names: "Ada, Bob", count });
        assert.equal(liked(0), "Liked by Ada, Bob and 0 others");
        assert.equal(liked(1), "Liked by Ada, Bob and 1 other");
        assert.equal(liked(5), "Liked by Ada, Bob and 5 others");
        assert.equal(i18n.t("story.postedHours", { count: 3 }), "3h ago");
      }),
    );

    it(
      "fr: singular / plural wording (0 is singular)",
      withPluralRules(async () => {
        const i18n = await createI18n("fr");
        const unread = (count) => i18n.t("a11y.notifications", { count });
        assert.equal(unread(0), "Notifications, 0 non lue");
        assert.equal(unread(1), "Notifications, 1 non lue");
        assert.equal(unread(5), "Notifications, 5 non lues");
        const liked = (count) => i18n.t("article.likedByMore", { names: "Ada, Bob", count });
        assert.equal(liked(1), "Aimé par Ada, Bob et 1 autre");
        assert.equal(liked(5), "Aimé par Ada, Bob et 5 autres");
        assert.equal(i18n.t("story.postedDays", { count: 2 }), "il y a 2 j");
      }),
    );

    it(
      "untranslated plural keys fall back to en with the en plural rules",
      withPluralRules(async () => {
        const i18n = await createI18n("ru");
        const liked = (count) => i18n.t("article.likedByMore", { names: "Ada, Bob", count });
        assert.equal(liked(1), "Liked by Ada, Bob and 1 other");
        assert.equal(liked(2), "Liked by Ada, Bob and 2 others");
        assert.equal(liked(5), "Liked by Ada, Bob and 5 others");
      }),
    );
  });
}
