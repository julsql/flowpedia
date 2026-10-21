import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { OG_IMAGE, PAGES, SITE_URL, renderPage } from "./seo.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// Shape of the document `expo export` emits (web.output = "single").
const EXPO_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Flowpedia</title>
  </head>
  <body>
    <noscript>
      You need to enable JavaScript to run this app.
    </noscript>
    <div id="root"></div>
  </body>
</html>`;

const meta = (html, attr, key) =>
  html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1];

function assertSeo(html, page) {
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  assert.equal(title, page.title);
  assert.match(html, /<html lang="en">/);
  assert.equal(meta(html, "name", "description"), page.description);
  assert.doesNotMatch(html, /noindex/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${SITE_URL}${page.path}" />`));
  assert.equal(meta(html, "property", "og:title"), page.title);
  assert.equal(meta(html, "property", "og:url"), `${SITE_URL}${page.path}`);
  assert.equal(meta(html, "property", "og:type"), "website");
  assert.equal(meta(html, "property", "og:locale"), "en_US");
  assert.equal(meta(html, "property", "og:image"), OG_IMAGE);
  assert.equal(meta(html, "name", "twitter:card"), "summary");
  assert.equal((html.match(/<h1>/g) ?? []).length, 1);
  const ld = html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)?.[1];
  const types = JSON.parse(ld)["@graph"].map((n) => n["@type"]);
  assert.deepEqual(types, ["WebSite", "WebApplication"]);
}

describe("SEO pages config", () => {
  it("has unique titles (50-60 chars) and descriptions (140-160 chars)", () => {
    for (const p of PAGES) {
      assert.ok(p.title.length >= 50 && p.title.length <= 60, `${p.path} title: ${p.title.length}`);
      const d = p.description.length;
      assert.ok(d >= 140 && d <= 160, `${p.path} description: ${d}`);
    }
    assert.equal(new Set(PAGES.map((p) => p.title)).size, PAGES.length);
    assert.equal(new Set(PAGES.map((p) => p.description)).size, PAGES.length);
  });

  it("every page is listed in sitemap.xml", () => {
    const sitemap = readFileSync(resolve(here, "../public/sitemap.xml"), "utf8");
    for (const p of PAGES) assert.ok(sitemap.includes(`<loc>${SITE_URL}${p.path}</loc>`), p.path);
  });
});

describe("renderPage", () => {
  for (const page of PAGES) {
    it(`injects the key tags for ${page.path}`, () => {
      assertSeo(renderPage(EXPO_HTML, page, { fontPreloads: ["/assets/x.ttf"] }), page);
    });
  }

  it("adds font preloads", () => {
    const html = renderPage(EXPO_HTML, PAGES[0], { fontPreloads: ["/assets/a.ttf"] });
    assert.match(
      html,
      /<link rel="preload" href="\/assets\/a.ttf" as="font" type="font\/ttf" crossorigin \/>/,
    );
  });
});

// After `pnpm build:web`, also check the real exported documents.
const dist = resolve(here, "../dist");
describe("exported dist", { skip: !existsSync(resolve(dist, "index.html")) }, () => {
  for (const page of PAGES) {
    it(`dist/${page.file} has the key tags`, () => {
      const html = readFileSync(resolve(dist, page.file), "utf8");
      assertSeo(html, page);
      assert.match(html, /rel="manifest"/);
      assert.match(html, /rel="apple-touch-icon"/);
      assert.match(html, /name="theme-color"/);
      assert.match(html, /rel="preload" href="\/assets\/[^"]+MaterialIcons\.[0-9a-f]+\.ttf"/);
    });
  }
});
