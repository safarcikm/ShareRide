// Makes the pictures the website shows the phone apps with (spec 35, 3.8),
// into public/stores/, which the web export serves at /stores/:
// - the App Store's badge, Apple's own file as it is;
// - Google Play's badges in English and Icelandic, Google's own files
//   without the empty margin around the badge, so both badges line up at
//   the same height (the badge itself is not changed);
// - the QR code of https://puffinride.is/app (spec 35, 3.7).
// The stores' files are kept as downloaded in assets/app-promotion/:
//   Apple: https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg
//   Google: https://play.google.com/intl/en_us/badges/static/images/badges/<en|is>_badge_web_generic.png
// Run it after changing one, then commit the files together:
//   node scripts/app-promotion-images.ts
// It uses Playwright's Chromium (PLAYWRIGHT_CHROMIUM_PATH picks another one)
// and toqr, the QR encoder Expo's own command line uses.
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { toQR } from "toqr";

const sources = join(import.meta.dirname, "..", "assets", "app-promotion");
const stores = join(import.meta.dirname, "..", "public", "stores");

/** The address the QR code holds. */
const appLink = "https://puffinride.is/app";

/** Google's PNG is 646 by 250, with a margin of 41 pixels around the badge. */
const googleMargin = 41;
const googleBadge = { width: 646 - 2 * googleMargin, height: 250 - 2 * googleMargin };

await copyFile(join(sources, "app-store-badge-en.svg"), join(stores, "app-store-badge-en.svg"));

const env = process.env as Readonly<Record<string, string | undefined>>;
const browser = await chromium.launch({ executablePath: env["PLAYWRIGHT_CHROMIUM_PATH"] });
try {
  for (const language of ["en", "is"]) {
    const png = await readFile(join(sources, `google-play-badge-${language}.png`));
    const page = await browser.newPage({ viewport: googleBadge, deviceScaleFactor: 1 });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}img{display:block;margin:-${String(googleMargin)}px}</style>` +
        `<img src="data:image/png;base64,${png.toString("base64")}">`,
    );
    await writeFile(
      join(stores, `google-play-badge-${language}.png`),
      await page.screenshot({ omitBackground: true }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}

// Dark squares on white whatever the page's look, with a quiet margin of
// four squares, as the standard asks; medium error correction.
// toqr's levels are a const enum it does not export: 0 is M (its default, 1, is L).
// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-assignment
const squares = toQR(appLink, 0);
const side = Math.sqrt(squares.length);
const quiet = 4;
const path: string[] = [];
for (let row = 0; row < side; row += 1) {
  for (let column = 0; column < side; column += 1) {
    if (squares[row * side + column] === 1) {
      path.push(`M${String(column + quiet)} ${String(row + quiet)}h1v1h-1z`);
    }
  }
}
const size = side + 2 * quiet;
await writeFile(
  join(stores, "app-qr.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(size)} ${String(size)}" shape-rendering="crispEdges">` +
    `<rect width="${String(size)}" height="${String(size)}" fill="#FFFFFF"/>` +
    `<path fill="#1F2A30" d="${path.join("")}"/></svg>\n`,
);
