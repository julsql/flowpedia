// Single-source icon pipeline.
//
//   assets/icon.png (1024×1024)  ──►  native (app.json: icon, adaptiveIcon, splash)
//                                └─►  web/PWA: public/{icon-512,icon-192,apple-touch-icon,favicon}.png
//
// To swap in the FINAL icon: drop a 1024×1024 PNG at apps/mobile/assets/icon.png
// and run `pnpm --filter @flowpedia/mobile icons` (derives every other size),
// then rebuild. Pass `--new` to (re)draw the placeholder test icon from scratch.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";

const ASSETS = resolve("assets");
const PUBLIC = resolve("public");
const MASTER = resolve(ASSETS, "icon.png");

const BG = [0x12, 0x11, 0x10, 0xff]; // brand dark
const FG = [0xd9, 0x82, 0x2b, 0xff]; // brand amber
// Lightning bolt ("Flow") on a 1024 canvas, kept inside the maskable safe zone.
const BOLT = [
  [600, 208],
  [336, 560],
  [488, 560],
  [424, 816],
  [688, 464],
  [536, 464],
];

function inPoly(x, y, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

/** Render the placeholder test icon to a `size`×`size` PNG buffer. */
function drawTestIcon(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const scale = size / 1024;
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // PNG filter: none
    for (let x = 0; x < size; x++) {
      const c = inPoly(x / scale + 0.5, y / scale + 0.5, BOLT) ? FG : BG;
      raw[o++] = c[0];
      raw[o++] = c[1];
      raw[o++] = c[2];
      raw[o++] = c[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function write(path, buf) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  console.log("  wrote", path.replace(`${process.cwd()}/`, ""));
}

/** Resize the master into `out` at `size` using macOS sips. */
function derive(out, size) {
  execFileSync("sips", ["-z", String(size), String(size), MASTER, "--out", out], {
    stdio: "ignore",
  });
  console.log("  wrote", out.replace(`${process.cwd()}/`, ""), `(${size}px)`);
}

const forceNew = process.argv.includes("--new");
if (forceNew || !existsSync(MASTER)) {
  console.log("Drawing placeholder test icon →");
  write(MASTER, drawTestIcon(1024));
} else {
  console.log("Using existing master assets/icon.png →");
}

console.log("Deriving web/PWA sizes →");
derive(resolve(PUBLIC, "icon-512.png"), 512);
derive(resolve(PUBLIC, "icon-192.png"), 192);
derive(resolve(PUBLIC, "apple-touch-icon.png"), 180);
derive(resolve(PUBLIC, "favicon.png"), 48);
console.log("Done. Native icons come straight from assets/icon.png via app.json.");
