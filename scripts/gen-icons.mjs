// Renders the PWA icons from the brand mark: `node scripts/gen-icons.mjs`.
// sharp ships with Next.js; the output PNGs are committed under public/icons.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
// favicon.ico for browsers, Safari and search engines that skip the SVG icon:
// 16, 32 and 48 px PNGs packed in one ICO file (Next serves src/app/favicon.ico).
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((size) => sharp(mark, { density: 384 }).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const entry = 6 + 16 * i;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt16LE(1, entry + 4); // colour planes
  header.writeUInt16LE(32, entry + 6); // bits per pixel
  header.writeUInt32LE(pngs[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += pngs[i].length;
});
writeFileSync(new URL("../src/app/favicon.ico", import.meta.url), Buffer.concat([header, ...pngs]));

console.log("icons written to public/icons and src/app/favicon.ico");
