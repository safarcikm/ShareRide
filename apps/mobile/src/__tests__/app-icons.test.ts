import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { colors } from "../theme/tokens";

// Spec 15, section 4.9: the app icon, the Android icon layers, the opening
// screen and the browser tab icon, all drawn from logo C, the puffin pin. The pictures are
// exported from the drawings in assets/logo by scripts/export-icons.ts.
const appDir = join(__dirname, "..", "..");

type SplashOptions = {
  readonly image: string;
  readonly imageWidth: number;
  readonly backgroundColor: string;
  readonly dark: { readonly image?: string; readonly backgroundColor: string };
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

/** The alpha, 0 to 255, of every pixel of an 8-bit RGBA PNG, row by row. */
function alphaOf(path: string): {
  readonly size: number;
  readonly alpha: (x: number, y: number) => number;
} {
  const file = readFileSync(join(appDir, path));
  expect(file[25]).toBe(6);
  const width = file.readUInt32BE(16);
  const data: Buffer[] = [];
  for (let at = 8; at < file.length;) {
    const length = file.readUInt32BE(at);
    if (file.subarray(at + 4, at + 8).toString("latin1") === "IDAT") {
      data.push(file.subarray(at + 8, at + 8 + length));
    }
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const rows: Buffer[] = [];
  // Undo each row's filter (PNG, section 9), so every pixel can be read.
  for (let y = 0; y * (stride + 1) < raw.length; y++) {
    const filter = raw[y * (stride + 1)];
    const row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    const above = rows[y - 1] ?? Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? (row[i - 4] ?? 0) : 0;
      const up = above[i] ?? 0;
      const upLeft = i >= 4 ? (above[i - 4] ?? 0) : 0;
      const guess = left + up - upLeft;
      const near = [left, up, upLeft].map((value) => Math.abs(guess - value));
      const paeth =
        (near[0] ?? 0) <= (near[1] ?? 0) && (near[0] ?? 0) <= (near[2] ?? 0)
          ? left
          : (near[1] ?? 0) <= (near[2] ?? 0)
            ? up
            : upLeft;
      const add = [0, left, up, Math.floor((left + up) / 2), paeth][filter ?? 0] ?? 0;
      row[i] = ((row[i] ?? 0) + add) & 0xff;
    }
    rows.push(row);
  }
  return { size: width, alpha: (x, y) => rows[y]?.[x * 4 + 3] ?? 0 };
}

/**
 * A disc that fills its square: opaque across the middle to every edge,
 * see-through in the corners. Google shows a site's icon in a round frame
 * (spec 23, 3.6, item 5), so a disc fills it, where a rounded square left
 * the frame's corners empty.
 */
function expectDisc(path: string, size: number): void {
  const { size: width, alpha } = alphaOf(path);
  expect(width).toBe(size);
  const at = (fraction: number) => Math.round(fraction * (size - 1));
  // A pixel the circle's edge only crosses is a little see-through, so
  // "opaque" is nearly so, and "see-through" is nearly empty.
  const looks = (points: readonly (readonly [number, number])[]) =>
    Object.fromEntries(
      points.map(([x, y]) => {
        const value = alpha(at(x), at(y));
        const look = value >= 224 ? "opaque" : value <= 16 ? "see-through" : String(value);
        return [`${String(x)}, ${String(y)}`, look];
      }),
    );
  const all = (points: readonly (readonly [number, number])[], look: string) =>
    Object.fromEntries(points.map(([x, y]) => [`${String(x)}, ${String(y)}`, look]));
  // Opaque across the middle, to the edge on every side.
  const edges = [
    [0.5, 0.01],
    [0.01, 0.5],
    [0.99, 0.5],
    [0.5, 0.99],
    [0.5, 0.5],
  ] as const;
  expect(looks(edges)).toEqual(all(edges, "opaque"));
  // See-through inside a rounded square's corner, which is outside the circle.
  const corners = [
    [0.09, 0.09],
    [0.91, 0.09],
    [0.09, 0.91],
    [0.91, 0.91],
  ] as const;
  expect(looks(corners)).toEqual(all(corners, "see-through"));
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
  it("uses the puffin pin as the app icon, filling the square with moss", () => {
    expect(config.ios.icon.light).toBe(config.icon);
    expectFullSquare(config.icon, colors.light.primary);
  });

  it("has an iOS dark icon on night and a tinted one in grey on black", () => {
    expectFullSquare(config.ios.icon.dark, colors.dark.background);
    expectFullSquare(config.ios.icon.tinted, "#000000");
  });

  it("gives Android a pin layer and a one-colour layer over moss", () => {
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
    // The same picture in the dark: dark mode has no picture of its own, so
    // Android draws its one set (two at once raced in the build).
    expect(splash.dark.image).toBeUndefined();
    expect(splash.imageWidth).toBe(288);
    expectSeeThrough(splash.image, 1152);
  });

  it("shows the icon in the browser tab as a disc", () => {
    expectSeeThrough(config.web.favicon, 48);
    expectDisc(config.web.favicon, 48);
  });

  it("gives Google a round icon of 192 pixels, which fills its round frame (spec 23, 3.6)", () => {
    expectDisc("public/icon-192.png", 192);
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
    const drawings = readdirSync(join(appDir, "assets", "logo")).filter((name) =>
      name.endsWith(".svg"),
    );
    expect(drawings.sort()).toEqual(pictures.map((name) => name.replace(/\.png$/, ".svg")).sort());
  });
});
