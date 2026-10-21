// `expo export` (web.output = "single") emits a default index.html and ignores
// app/+html.tsx, so we inject the PWA bits (manifest, icons, theme-color and the
// service-worker registration) into the exported document. Idempotent.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve("dist/index.html");
let html = readFileSync(file, "utf8");

if (html.includes('rel="manifest"')) {
  console.log("inject-pwa: tags already present, skipping.");
  process.exit(0);
}

const SITE_URL = "https://flowpedia.julsql.fr";
const DESCRIPTION =
  "Flowpedia: scroll Wikipedia like a social feed. Like, share and jump from topic to topic through inline links.";

const tags = `    <meta name="description" content="${DESCRIPTION}" />
    <link rel="canonical" href="${SITE_URL}/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Flowpedia" />
    <meta property="og:title" content="Flowpedia" />
    <meta property="og:description" content="${DESCRIPTION}" />
    <meta property="og:url" content="${SITE_URL}/" />
    <meta property="og:image" content="${SITE_URL}/icon-512.png" />
    <meta name="twitter:card" content="summary" />
    <script>
      // Single-page export: point the canonical at the current route, not always "/".
      (function () {
        var l = document.querySelector('link[rel="canonical"]');
        if (l && location.origin === "${SITE_URL}") l.href = "${SITE_URL}" + location.pathname;
      })();
    </script>
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#121110" />
    <link rel="icon" href="/favicon.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Flowpedia" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <script>
      // Never run the service worker on localhost, so a locally-served build
      // can't hijack the dev server's bundle with a cached copy.
      if ('serviceWorker' in navigator &&
          location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js').catch(function () {});
        });
      }
    </script>
`;

// Allow the viewport to extend under notches in standalone mode.
html = html.replace(
  'content="width=device-width, initial-scale=1, shrink-to-fit=no"',
  'content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"',
);
html = html.replace("</head>", `${tags}  </head>`);

if (!html.includes('rel="manifest"')) {
  throw new Error("inject-pwa: failed to inject (no </head> found in index.html)");
}

writeFileSync(file, html);
console.log("inject-pwa: injected PWA tags into dist/index.html");
