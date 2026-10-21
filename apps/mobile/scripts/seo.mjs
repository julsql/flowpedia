// SEO head tags for the static web export. The app is a client-rendered SPA
// (web.output = "single"), so crawlers only see what is hard-coded here.
// Pure functions (no fs) so they can be unit-tested — see seo.test.mjs.

export const SITE_URL = "https://flowpedia.julsql.fr";
export const OG_IMAGE = `${SITE_URL}/icon-512.png`;

/** Public, indexable routes. Each gets its own pre-rendered HTML document. */
export const PAGES = [
  {
    path: "/",
    file: "index.html",
    title: "Flowpedia – Scroll Wikipedia like your social media feed",
    description:
      "Flowpedia turns Wikipedia into a social-style feed: scroll articles, like and share them, and jump from topic to topic through tappable inline links.",
  },
  {
    path: "/explore",
    file: "explore.html",
    title: "Explore Wikipedia – Search and trending topics | Flowpedia",
    description:
      "Search every Wikipedia article and browse trending topics on Flowpedia, then open any result as a clean, readable card you can like, save and share.",
  },
  {
    path: "/flow",
    file: "flow.html",
    title: "Flow – Immersive full-screen Wikipedia cards | Flowpedia",
    description:
      "Swipe through Wikipedia one full-screen card at a time in Flowpedia's Flow: a new subject on every swipe, with the full article only a tap away.",
  },
];

const escapeAttr = (s) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "Flowpedia",
        url: `${SITE_URL}/`,
        description: PAGES[0].description,
        inLanguage: "en",
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/#app`,
        name: "Flowpedia",
        url: `${SITE_URL}/`,
        description: PAGES[0].description,
        applicationCategory: "ReferenceApplication",
        operatingSystem: "Web, iOS, Android",
        browserRequirements: "Requires JavaScript",
        image: OG_IMAGE,
        isPartOf: { "@id": `${SITE_URL}/#website` },
      },
    ],
  };
}

/** Head tags for one page. `fontPreloads` = absolute paths of fonts to preload. */
export function headTags(page, { fontPreloads = [] } = {}) {
  const url = `${SITE_URL}${page.path}`;
  const t = escapeAttr(page.title);
  const d = escapeAttr(page.description);
  const preloads = fontPreloads
    .map((f) => `    <link rel="preload" href="${f}" as="font" type="font/ttf" crossorigin />\n`)
    .join("");
  return `    <meta name="description" content="${d}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Flowpedia" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />
    <meta property="og:image:alt" content="Flowpedia logo" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd())}</script>
${preloads}`;
}

// Shown only without JavaScript (and to non-rendering crawlers): one h1 plus
// links to the other public pages. Never rendered when the app boots.
function noscript(page) {
  const links = PAGES.map((p) => `<a href="${p.path}">${escapeHtml(p.title)}</a>`).join(" · ");
  return `<noscript>
      <h1>${escapeHtml(page.title)}</h1>
      <p>${escapeHtml(page.description)}</p>
      <p>${links}</p>
      <p>You need to enable JavaScript to run this app.</p>
    </noscript>`;
}

/** Rewrite the exported Expo document for `page`. Idempotency is the caller's job. */
export function renderPage(html, page, opts) {
  let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`);
  out = out.replace("</head>", `${headTags(page, opts)}  </head>`);
  out = out.replace(/<noscript>[\s\S]*?<\/noscript>/, noscript(page));
  // Non-public routes fall back to index.html: keep the canonical on the real URL.
  if (page.path === "/") {
    out = out.replace(
      "</head>",
      `    <script>
      (function () {
        var p = location.pathname, l = document.querySelector('link[rel="canonical"]');
        if (l && location.origin === "${SITE_URL}" && p !== "/") l.href = "${SITE_URL}" + p;
      })();
    </script>
  </head>`,
    );
  }
  return out;
}
