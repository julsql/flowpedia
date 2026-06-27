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

const tags = `    <link rel="manifest" href="/manifest.json" />
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
