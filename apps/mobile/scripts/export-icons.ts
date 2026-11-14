// Exports the app icon, the Android icon layers, the opening screen icon and
// the browser tab icon from the drawings in assets/logo (spec 15, section
// 4.9). Run it after changing a drawing, then commit the drawing and the
// pictures together:
//   node scripts/export-icons.ts
// It uses Playwright's Chromium; PLAYWRIGHT_CHROMIUM_PATH picks another one.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const assets = join(import.meta.dirname, "..", "assets");

/** Each drawing in assets/logo, and the width and height of its picture. */
const pictures: Readonly<Record<string, number>> = {
  icon: 1024,
  "icon-dark": 1024,
  "icon-tinted": 1024,
  "android-icon-foreground": 1024,
  "android-icon-monochrome": 1024,
  "splash-icon": 1152,
  favicon: 48,
};

const env = process.env as Readonly<Record<string, string | undefined>>;
const browser = await chromium.launch({ executablePath: env["PLAYWRIGHT_CHROMIUM_PATH"] });
try {
  for (const [name, size] of Object.entries(pictures)) {
    const drawing = await readFile(join(assets, "logo", `${name}.svg`), "utf8");
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${String(size)}px;height:${String(size)}px}</style>${drawing}`,
    );
    // Chromium leaves out the alpha channel when every pixel is opaque, so
    // the icons that fill their square come out the way the app stores want.
    await writeFile(join(assets, `${name}.png`), await page.screenshot({ omitBackground: true }));
    await page.close();
    process.stdout.write(`assets/${name}.png\n`);
  }
} finally {
  await browser.close();
}
