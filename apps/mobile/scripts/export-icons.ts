// Exports the app icon, the Android icon layers, the opening screen icon and
// the browser tab icon from the drawings in assets/logo (spec 15, section
// 4.9), the web's larger icons in public/, and the link preview picture,
// public/share.png (spec 23, 3.6), from assets/share, which the web export
// serves at /share.png; it also copies the drawings and fonts the API draws a
// shared ride's link preview with (spec 23, 3.10). Run it after changing a
// drawing, then commit the drawing and the pictures together:
//   node scripts/export-icons.ts
// It uses Playwright's Chromium; PLAYWRIGHT_CHROMIUM_PATH picks another one.
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { chromium } from "@playwright/test";

const assets = join(import.meta.dirname, "..", "assets");
const fontFiles = join(import.meta.dirname, "..", "node_modules", "@expo-google-fonts");

/** A bundled font as a data address, so the page needs nothing from outside. */
async function font(family: string, file: string): Promise<string> {
  const data = await readFile(join(fontFiles, family, file));
  return `url(data:font/ttf;base64,${data.toString("base64")})`;
}

/**
 * The link preview (spec 23, 3.6): the two puffins in their car over the
 * name and what it is in both languages, 1200 by 630 as link previews want.
 * The drawing and the name are in the middle, so an app that crops the
 * picture to a square keeps them. It names nobody.
 */
async function sharePicture(): Promise<string> {
  const scene = await readFile(join(assets, "share", "puffins-in-car.svg"), "utf8");
  const icon = await readFile(join(assets, "logo", "icon.svg"), "utf8");
  const display = await font("fredoka", "600SemiBold/Fredoka_600SemiBold.ttf");
  const body = await font("nunito", "700Bold/Nunito_700Bold.ttf");
  return `<style>
@font-face{font-family:Display;src:${display}}
@font-face{font-family:Body;src:${body}}
html,body{margin:0}
.card{width:1200px;height:630px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#EEF3F4}
.scene svg{display:block;width:520px;height:296px}
.name{display:flex;align-items:center;gap:24px;margin:20px 0 16px}
.icon{flex:none;width:84px;height:84px;border-radius:19px;overflow:hidden}
.icon svg{display:block;width:84px;height:84px}
h1{margin:0;font:600 104px/1 Display;color:#1F2A30}
p{margin:0;font:700 40px/1.3 Body;color:#2F6B4F}
</style><div class="card"><div class="scene">${scene}</div><div class="name"><div class="icon">${icon}</div><h1>PuffinRide</h1></div><p>Samferða um Ísland · Shared rides across Iceland</p></div>`;
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

/**
 * Pictures for the API: the icon inside every email (spec 24, 3.1), three
 * times its 40 pixels. The API's image holds no apps/mobile, so it keeps its own.
 */
const forTheApi: readonly { drawing: string; size: number; file: string }[] = [
  {
    drawing: "favicon",
    size: 120,
    file: join(import.meta.dirname, "..", "..", "api", "assets", "email-logo.png"),
  },
];

/**
 * Icons the web export serves from public/ beside Expo's /favicon.ico (spec
 * 23, 3.6): one of 192 pixels, a multiple of 48 as Google asks for to show
 * it in search results, and the one a phone puts on its home screen, which
 * fills its square as iOS wants.
 */
const forTheWeb: readonly { drawing: string; size: number; file: string }[] = [
  {
    drawing: "favicon",
    size: 192,
    file: join(import.meta.dirname, "..", "public", "icon-192.png"),
  },
  {
    drawing: "icon",
    size: 180,
    file: join(import.meta.dirname, "..", "public", "apple-touch-icon.png"),
  },
];

/**
 * What the API draws a shared ride's link preview with (spec 23, 3.10, ADR
 * 0049): the car, the icon and the fonts with their licences, copied as they
 * are, as the API's image holds no apps/mobile.
 */
const tripPreview = join(import.meta.dirname, "..", "..", "api", "assets", "trip-preview");
const forTheRidePicture: readonly [from: string, to: string][] = [
  [join(assets, "share", "puffins-in-car.svg"), "puffins-in-car.svg"],
  [join(assets, "logo", "icon.svg"), "icon.svg"],
  [join(fontFiles, "fredoka", "600SemiBold", "Fredoka_600SemiBold.ttf"), ""],
  [join(fontFiles, "nunito", "700Bold", "Nunito_700Bold.ttf"), ""],
  [join(fontFiles, "nunito", "600SemiBold", "Nunito_600SemiBold.ttf"), ""],
  [join(fontFiles, "fredoka", "LICENSE_FONT"), "Fredoka-OFL.txt"],
  [join(fontFiles, "nunito", "LICENSE_FONT"), "Nunito-OFL.txt"],
];
for (const [from, to] of forTheRidePicture) {
  const file = join(tripPreview, to === "" ? basename(from) : to);
  await copyFile(from, file);
  process.stdout.write(`${file}\n`);
}

const env = process.env as Readonly<Record<string, string | undefined>>;
const browser = await chromium.launch({ executablePath: env["PLAYWRIGHT_CHROMIUM_PATH"] });
try {
  const exports = [
    ...Object.entries(pictures).map(([name, size]) => ({
      drawing: name,
      size,
      file: join(assets, `${name}.png`),
    })),
    ...forTheApi,
    ...forTheWeb,
  ];
  for (const { drawing: name, size, file } of exports) {
    const drawing = await readFile(join(assets, "logo", `${name}.svg`), "utf8");
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${String(size)}px;height:${String(size)}px}</style>${drawing}`,
    );
    // Chromium leaves out the alpha channel when every pixel is opaque, so
    // the icons that fill their square come out the way the app stores want.
    await writeFile(file, await page.screenshot({ omitBackground: true }));
    await page.close();
    process.stdout.write(`${file}\n`);
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
