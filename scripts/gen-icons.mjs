// Renders the PWA icons from the brand mark: `node scripts/gen-icons.mjs`.
// sharp ships with Next.js; the output PNGs are committed under public/icons.
import { mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";

const mark = readFileSync(new URL("../public/brand/adupay-mark.svg", import.meta.url));
const out = new URL("../public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });

// The mark's own rounded square, for "any" purpose icons.
for (const size of [192, 512]) {
  await sharp(mark, { density: 384 }).resize(size, size).png().toFile(new URL(`icon-${size}.png`, out).pathname.slice(1));
}

// Maskable / Apple: full-bleed indigo with the mark inside the 80% safe zone.
const inner = (size, ratio) => sharp(mark, { density: 384 }).resize(Math.round(size * ratio), Math.round(size * ratio)).png().toBuffer();
for (const [name, size, ratio] of [
  ["maskable-512.png", 512, 0.72],
  ["apple-touch-icon.png", 180, 0.86],
]) {
  await sharp({ create: { width: size, height: size, channels: 4, background: "#1F2A5A" } })
    .composite([{ input: await inner(size, ratio), gravity: "center" }])
    .png()
    .toFile(new URL(name, out).pathname.slice(1));
}
console.log("icons written to public/icons");
