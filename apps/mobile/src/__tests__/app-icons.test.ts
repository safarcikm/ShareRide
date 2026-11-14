import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { colors } from "../theme/tokens";

// Spec 15, section 4.9: the app icon, the Android icon layers, the opening
// screen and the browser tab icon, all drawn from logo A. The pictures are
// exported from the drawings in assets/logo by scripts/export-icons.ts.
const appDir = join(__dirname, "..", "..");

type SplashOptions = {
  readonly image: string;
  readonly imageWidth: number;
  readonly backgroundColor: string;
  readonly dark: { readonly image: string; readonly backgroundColor: string };
};

type AppConfig = {
  readonly expo: {
    readonly icon: string;
    readonly userInterfaceStyle: string;
    readonly ios: { readonly icon: { light: string; dark: string; tinted: string } };
    readonly android: {
      readonly adaptiveIcon: {
        readonly foregroundImage: string;
        readonly monochromeImage: string;
        readonly backgroundColor: string;
        readonly backgroundImage?: string;
      };
    };
    readonly web: { readonly favicon: string };
    readonly plugins: readonly (string | readonly [string, unknown])[];
  };
};

const config = (JSON.parse(readFileSync(join(appDir, "app.json"), "utf8")) as AppConfig).expo;

function splashOptions(): SplashOptions {
  const entry = config.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
  );
  if (!Array.isArray(entry)) throw new Error("expo-splash-screen has no options in app.json");
  return entry[1] as SplashOptions;
}

type Png = {
  readonly width: number;
  readonly height: number;
  readonly hasAlpha: boolean;
  /** The top-left pixel, as #RRGGBB. */
  readonly corner: string;
  /** The top-left pixel's alpha, 0 to 255 (255 without an alpha channel). */
  readonly cornerAlpha: number;
};

/** Reads an 8-bit RGB or RGBA PNG: its size and its top-left pixel. */
function readPng(path: string): Png {
  const file = readFileSync(join(appDir, path));
  expect(file.subarray(1, 4).toString("latin1")).toBe("PNG");
  const colourType = file[25];
  expect(file[24]).toBe(8);
  expect([2, 6]).toContain(colourType);
  const hasAlpha = colourType === 6;
  const data: Buffer[] = [];
  for (let at = 8; at < file.length;) {
    const length = file.readUInt32BE(at);
    if (file.subarray(at + 4, at + 8).toString("latin1") === "IDAT") {
      data.push(file.subarray(at + 8, at + 8 + length));
    }
    at += 12 + length;
  }
  // Byte 0 is the first row's filter; whatever the filter, the first pixel
  // of the first row is stored unchanged, because nothing comes before it.
  const pixels = inflateSync(Buffer.concat(data));
  const hex = (byte: number | undefined): string =>
    (byte ?? 0).toString(16).padStart(2, "0").toUpperCase();
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
    hasAlpha,
    corner: `#${hex(pixels[1])}${hex(pixels[2])}${hex(pixels[3])}`,
    cornerAlpha: hasAlpha ? (pixels[4] ?? 0) : 255,
  };
}

/** An icon the phone cuts to shape itself: square, 1024, no transparency. */
function expectFullSquare(path: string, corner: string): void {
  const png = readPng(path);
  expect(png).toMatchObject({ width: 1024, height: 1024, hasAlpha: false, corner });
}

/** A picture drawn on a see-through background. */
function expectSeeThrough(path: string, size: number): void {
  const png = readPng(path);
  expect(png).toMatchObject({ width: size, height: size, hasAlpha: true, cornerAlpha: 0 });
}

describe("app icon and opening screen (spec 15, section 4.9)", () => {
  it("uses logo A as the app icon, filling the square with moss", () => {
    expect(config.ios.icon.light).toBe(config.icon);
    expectFullSquare(config.icon, colors.light.primary);
  });

  it("has an iOS dark icon on night and a tinted one in grey on black", () => {
    expectFullSquare(config.ios.icon.dark, colors.dark.background);
    expectFullSquare(config.ios.icon.tinted, "#000000");
  });

  it("gives Android a car layer and a one-colour layer over moss", () => {
    const adaptive = config.android.adaptiveIcon;
    expect(adaptive.backgroundColor).toBe(colors.light.primary);
    expect(adaptive.backgroundImage).toBeUndefined();
    expectSeeThrough(adaptive.foregroundImage, 1024);
    expectSeeThrough(adaptive.monochromeImage, 1024);
  });

  it("opens on the icon over frost, or over night in dark mode", () => {
    const splash = splashOptions();
    expect(config.userInterfaceStyle).toBe("automatic");
    expect(splash.backgroundColor).toBe(colors.light.background);
    expect(splash.dark.backgroundColor).toBe(colors.dark.background);
    expect(splash.dark.image).toBe(splash.image);
    expect(splash.imageWidth).toBe(288);
    expectSeeThrough(splash.image, 1024);
  });

  it("shows the icon in the browser tab", () => {
    expectSeeThrough(config.web.favicon, 48);
  });

  it("keeps a drawing for every picture and no picture the app does not use", () => {
    const used = new Set(
      [
        config.icon,
        config.ios.icon.dark,
        config.ios.icon.tinted,
        config.android.adaptiveIcon.foregroundImage,
        config.android.adaptiveIcon.monochromeImage,
        splashOptions().image,
        config.web.favicon,
      ].map((path) => path.replace(/^\.\/assets\//, "")),
    );
    const pictures = readdirSync(join(appDir, "assets")).filter((name) => name.endsWith(".png"));
    expect(pictures.sort()).toEqual([...used].sort());
    const drawings = readdirSync(join(appDir, "assets", "logo"));
    expect(drawings.sort()).toEqual(pictures.map((name) => name.replace(/\.png$/, ".svg")).sort());
  });
});
