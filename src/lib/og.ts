// Shared by the share images (wallet cards, the league): theme, fonts and where they point.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { siteUrl } from "./site";

/** The dark theme from globals.css, which reads best in social feeds. */
export const C = { page: "#0d0d0d", ink: "#f0efec", ink2: "#c3c2b7", muted: "#898781", line: "#2c2c2a", accent: "#3987e5", up: "#3fc794", down: "#f07f7f" };

const FONTS = [
  ["Geist", "geist-sans/Geist-Regular.ttf", 400],
  ["Geist", "geist-sans/Geist-SemiBold.ttf", 600],
  ["GeistMono", "geist-mono/GeistMono-Medium.ttf", 500],
] as const;

export async function ogFonts() {
  try {
    return await Promise.all(
      FONTS.map(async ([name, file, weight]) => ({
        name,
        weight,
        style: "normal" as const,
        data: await readFile(join(process.cwd(), "node_modules/geist/dist/fonts", file)),
      })),
    );
  } catch {
    return undefined; // fall back to the default font rather than failing the card
  }
}

/** Where a card says to go: the configured site, Vercel's production domain, or the repo. */
export function siteHost(): string {
  return siteUrl()?.host ?? "github.com/patrickballard/perpbook";
}
