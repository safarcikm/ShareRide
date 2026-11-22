// Exports the app icon, the Android icon layers, the opening screen icon and
// the browser tab icon from the drawings in assets/logo (spec 15, section
// 4.9), and the link preview picture, public/share.png (spec 23, 3.6), which
// the web export serves at /share.png. Run it after changing a drawing,
// then commit the drawing and the pictures together:
//   node scripts/export-icons.ts
// It uses Playwright's Chromium; PLAYWRIGHT_CHROMIUM_PATH picks another one.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const assets = join(import.meta.dirname, "..", "assets");
const fontFiles = join(import.meta.dirname, "..", "node_modules", "@expo-google-fonts");

/** A bundled font as a data address, so the page needs nothing from outside. */
async function font(family: string, file: string): Promise<string> {
  const data = await readFile(join(fontFiles, family, file));
  return `url(data:font/ttf;base64,${data.toString("base64")})`;
}

/**
 * The link preview (spec 23, 3.6): the app icon, the name and what it is in
 * both languages, 1200 by 630 as link previews want. It names nobody.
 */
async function sharePicture(): Promise<string> {
  const icon = await readFile(join(assets, "logo", "icon.svg"), "utf8");
  const display = await font("fredoka", "600SemiBold/Fredoka_600SemiBold.ttf");
  const body = await font("nunito", "700Bold/Nunito_700Bold.ttf");
  return `<style>
@font-face{font-family:Display;src:${display}}
@font-face{font-family:Body;src:${body}}
html,body{margin:0}
.card{width:1200px;height:630px;box-sizing:border-box;padding:0 96px;display:flex;align-items:center;gap:72px;background:#EEF3F4}
.icon{flex:none;width:340px;height:340px;border-radius:76px;overflow:hidden}
.icon svg{display:block;width:340px;height:340px}
h1{margin:0 0 28px;font:600 112px/1 Display;color:#1F2A30}
p{margin:0;font:700 44px/1.35 Body;color:#2F6B4F}
</style><div class="card"><div class="icon">${icon}</div><div><h1>PuffinRide</h1><p>Samferða um Ísland</p><p>Shared rides across Iceland</p></div></div>`;
}

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
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(await sharePicture());
  await page.evaluate(() => document.fonts.ready);
  const share = join(import.meta.dirname, "..", "public", "share.png");
  await writeFile(share, await page.screenshot());
  await page.close();
  process.stdout.write("public/share.png\n");
} finally {
  await browser.close();
}
