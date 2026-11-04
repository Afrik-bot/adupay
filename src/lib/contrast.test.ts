// WCAG AA contrast for every text/background pair the UI uses, in light and dark.
// Reads the real tokens from globals.css, and blends translucent badge
// backgrounds (bg-x/15) over the card the way the browser does.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function tokens(selector: ":root" | ".dark"): Record<string, string> {
  const block = css.slice(css.indexOf(`${selector} {`)).split("}")[0];
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const mix = (top: string, bottom: string, alpha: number): string =>
  `#${rgb(top)
    .map((c, i) => Math.round(c * alpha + rgb(bottom)[i] * (1 - alpha)))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const BRAND = { indigo: "#1f2a5a", offwhite: "#faf7f2" };

for (const theme of [":root", ".dark"] as const) {
  const t = tokens(theme);
  const tint = (name: string) => mix(t[name], t.card, 0.15);
  // [label, text, background, minimum] — 4.5 for body text, 3 for large/bold UI and icons.
  const pairs: [string, string, string, number][] = [
    ["body text", t.foreground, t.background, 4.5],
    ["card text", t["card-foreground"], t.card, 4.5],
    ["muted text on page", t["muted-foreground"], t.background, 4.5],
    ["muted text on card", t["muted-foreground"], t.card, 4.5],
    ["muted text on muted", t["muted-foreground"], t.muted, 4.5],
    ["primary button", t["primary-foreground"], t.primary, 4.5],
    ["accent button / badge", t["accent-foreground"], t.accent, 4.5],
    ["secondary", t["secondary-foreground"], t.secondary, 4.5],
    ["error text on card", t.destructive, t.card, 4.5],
    ["success text on card", t.success, t.card, 4.5],
    ["warning text on card", t.warning, t.card, 4.5],
    ["error badge", t.destructive, tint("destructive"), 4.5],
    ["success badge", t.success, tint("success"), 4.5],
    ["warning badge", t.warning, tint("warning"), 4.5],
    ["text on accent/40 notice", t.foreground, mix(t.accent, t.background, 0.4), 4.5],
    // Buttons have a 2px page-coloured offset, so the ring is judged against the page or card.
    ["focus ring vs page (non-text 3:1)", t.ring, t.background, 3],
    ["focus ring vs card (non-text 3:1)", t.ring, t.card, 3],
  ];
  // Fixed brand surfaces (same in both themes).
  pairs.push(
    ["balance card", BRAND.offwhite, BRAND.indigo, 4.5],
    ["balance card label (75%)", mix(BRAND.offwhite, BRAND.indigo, 0.75), BRAND.indigo, 4.5],
    ["landing hero small print (70%)", mix(BRAND.offwhite, BRAND.indigo, 0.7), BRAND.indigo, 4.5],
    ["saffron eyebrow/badge on indigo", "#f2a93b", BRAND.indigo, 4.5],
    ["USSD screen", "#1b2a12", "#dfe8d0", 4.5],
  );
  if (theme === ":root") pairs.push(["destructive button", "#ffffff", t.destructive, 4.5]);

  describe(`contrast (${theme === ":root" ? "light" : "dark"})`, () => {
    it.each(pairs)("%s meets AA", (_label, fg, bg, min) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
    });
  });
}
