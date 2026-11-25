// A shared ride's picture for its link preview (spec 23, 3.10; ADR 0049):
// an SVG in PuffinRide's look, turned into a PNG with resvg. It shows the
// route, the day and time, the stops on the way and the Iceland scene with
// the puffin driver's car; never a name, a photo, a price or a seat count
// (R23.8).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderAsync, Resvg, type ResvgRenderOptions } from "@resvg/resvg-js";
import { capitalised, createTranslator, type Locale } from "@shareride/i18n";
import { colors, icelandScene, people } from "@shareride/ui";
import { endsOf, rideVersion, whenOf, type Ride } from "./link-preview.ts";

/** The size link previews want, and the margin words keep from each side. */
export const pictureSize = { width: 1200, height: 630, margin: 56 } as const;

/**
 * The app's fonts (SIL Open Font License) and drawings, copied here by
 * `node scripts/export-icons.ts` in apps/mobile: the API's image has no
 * apps/mobile.
 */
const assets = join(import.meta.dirname, "..", "..", "..", "assets", "trip-preview");
const fontFiles = ["Fredoka_600SemiBold.ttf", "Nunito_700Bold.ttf", "Nunito_600SemiBold.ttf"].map(
  (file) => join(assets, file),
);
// resvg draws no words at all, without a word of warning, when a font is missing.
for (const file of fontFiles) {
  if (!existsSync(file)) throw new Error(`The ride picture's font is missing: ${file}`);
}
const renderOptions: ResvgRenderOptions = {
  font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Nunito" },
};

const inner = (svg: string) =>
  svg.slice(svg.indexOf(">", svg.indexOf("<svg")) + 1, svg.lastIndexOf("</svg>"));

/** The front page's car with the puffins (viewBox 4 9 190 108), without the one in the back seat. */
const car = (() => {
  const drawing = inner(readFileSync(join(assets, "puffins-in-car.svg"), "utf8"));
  const back = drawing.indexOf('<g transform="translate(58 57)');
  const driver = drawing.indexOf('<g transform="translate(96 58)');
  if (back < 0 || driver < back) throw new Error("The car drawing has changed: find its back seat");
  return drawing.slice(0, back) + drawing.slice(driver);
})();
const carBox = { x: 4, y: 9, width: 190, height: 108, wheelBottom: 115 } as const;

/** The app icon (viewBox 0 0 100 100), without its title. */
const icon = inner(readFileSync(join(assets, "icon.svg"), "utf8")).replace(
  /<title>[^<]*<\/title>/,
  "",
);

const light = colors.light;
const scene = icelandScene.light;

/** The kinds of words on the picture: family, weight and size. */
const styles = {
  name: { family: "Fredoka", weight: 600, size: 28 },
  route: { family: "Fredoka", weight: 600, size: 76 },
  when: { family: "Nunito", weight: 700, size: 34 },
  stops: { family: "Nunito", weight: 600, size: 26 },
  tag: { family: "Fredoka", weight: 600, size: 26 },
} as const;
type Style = keyof typeof styles;

/** Characters XML cannot hold at all: control characters other than tab and line breaks. */
// eslint-disable-next-line no-control-regex -- these are the characters it removes
const notInXml = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

const escapeXml = (text: string) =>
  text
    .replace(notInXml, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function textElement(
  text: string,
  style: Style,
  x: number,
  y: number,
  options: { size?: number; fill?: string; anchor?: "start" | "middle" | "end" } = {},
): string {
  const { family, weight } = styles[style];
  const size = options.size ?? styles[style].size;
  return (
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${family}" font-weight="${String(weight)}" ` +
    `font-size="${size.toFixed(1)}" fill="${options.fill ?? light.text}" text-anchor="${options.anchor ?? "start"}">${escapeXml(text)}</text>`
  );
}

/** Widths measured before: the same meeting point names come up again and again. */
const widths = new Map<string, number>();

/** How wide a text is drawn, in pixels, measured with the fonts the picture uses. */
export function textWidth(text: string, style: Style, size: number = styles[style].size): number {
  if (text.trim() === "") return 0;
  const key = `${style}\u0000${String(size)}\u0000${text}`;
  const known = widths.get(key);
  if (known !== undefined) return known;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="400">${textElement(text, style, 0, 200, { size })}</svg>`;
  const box = new Resvg(svg, renderOptions).getBBox();
  const width = box === undefined ? 0 : box.x + box.width;
  if (widths.size >= 5000) widths.clear();
  widths.set(key, width);
  return width;
}

/** The arrow between the two ends, and the gap on each side of it, for a route size. */
const arrow = (size: number) => ({ width: size * 0.72, gap: size * 0.32 });

/** A text shortened with an ellipsis until it fits, for names longer than any we have now. */
function shortened(text: string, style: Style, size: number, room: number): string {
  if (textWidth(text, style, size) <= room) return text;
  let kept = text;
  while (kept.length > 1 && textWidth(`${kept}…`, style, size) > room) kept = kept.slice(0, -1);
  return `${kept.trimEnd()}…`;
}

export interface RideLayout {
  /** One line [from, to], or two lines [from] and ["", to], where "" is the arrow. */
  readonly route: {
    readonly lines: readonly (readonly string[])[];
    readonly size: number;
    readonly widths: readonly number[];
  };
  readonly when: string;
  /** "Stops on the way: …", or null for a ride with none between. */
  readonly stops: string | null;
}

/** Where the words go: the route as large as fits, then the day and the stops (item 2). */
export function layOutRide(ride: Ride, locale: Locale): RideLayout {
  const t = createTranslator(locale);
  const room = pictureSize.width - 2 * pictureSize.margin;
  const { from, to, between } = endsOf(ride);
  const [first, last] = [from.name[locale], to.name[locale]];

  let route: RideLayout["route"] | undefined;
  for (let size = 76; size >= 56 && route === undefined; size -= 2) {
    const { width, gap } = arrow(size);
    const total =
      textWidth(first, "route", size) + 2 * gap + width + textWidth(last, "route", size);
    if (total <= room) route = { lines: [[first, last]], size, widths: [total] };
  }
  for (let size = 56; size >= 36 && route === undefined; size -= 2) {
    const { width, gap } = arrow(size);
    const widths = [textWidth(first, "route", size), width + gap + textWidth(last, "route", size)];
    if (widths.every((one) => one <= room) || size === 36) {
      const top = shortened(first, "route", size, room);
      const bottom = shortened(last, "route", size, room - width - gap);
      route = {
        lines: [[top], ["", bottom]],
        size,
        widths: [textWidth(top, "route", size), width + gap + textWidth(bottom, "route", size)],
      };
    }
  }
  if (route === undefined) throw new Error("unreachable: the smallest size always fits");

  const names = between.map((stop) => stop.name[locale]);
  const stopsLine = (shown: readonly string[]) =>
    t("seo.tripStops", {
      stops:
        shown.length === names.length
          ? shown.join(", ")
          : t("seo.tripMoreStops", { stops: shown.join(", "), count: names.length - shown.length }),
    });
  let stops: string | null = null;
  for (let shown = names.length; shown >= 1 && stops === null; shown -= 1) {
    const line = stopsLine(names.slice(0, shown));
    if (textWidth(line, "stops") <= room) stops = line;
  }
  const [firstStop] = names;
  if (stops === null && firstStop !== undefined) {
    // Not even one name fits: shorten it, and keep the count of the others.
    let kept = firstStop;
    while (kept.length > 1 && textWidth(stopsLine([`${kept}…`]), "stops") > room) {
      kept = kept.slice(0, -1);
    }
    stops = stopsLine([`${kept.trimEnd()}…`]);
  }

  return { route, when: capitalised(whenOf(ride, locale, true), locale), stops };
}

// ---------- the scene: mountains with glaciers, hills with lupines, a road ----------

function mountains(width: number, horizon: number, roadY: number, scale: number): string {
  const k = width / 1080;
  const y = (up: number) => (horizon - up * scale).toFixed(1);
  const x = (along: number) => (along * k).toFixed(1);
  let s =
    `<path d="M${x(-40)} ${y(-70)} L${x(120)} ${y(30)} Q${x(170)} ${y(70)} ${x(220)} ${y(40)} L${x(300)} ${y(-10)} ` +
    `Q${x(360)} ${y(10)} ${x(420)} ${y(-20)} L${x(560)} ${y(40)} Q${x(640)} ${y(118)} ${x(760)} ${y(120)} ` +
    `Q${x(880)} ${y(122)} ${x(960)} ${y(50)} L${x(1120)} ${y(-40)} L${x(1120)} ${roadY} L${x(-40)} ${roadY}Z" fill="${scene.mountain}"/>`;
  s +=
    `<path d="M${x(622)} ${y(88)} Q${x(680)} ${y(120)} ${x(760)} ${y(120)} Q${x(850)} ${y(121)} ${x(912)} ${y(84)} ` +
    `Q${x(880)} ${y(70)} ${x(850)} ${y(80)} Q${x(820)} ${y(64)} ${x(790)} ${y(80)} Q${x(760)} ${y(62)} ${x(725)} ${y(80)} ` +
    `Q${x(690)} ${y(64)} ${x(660)} ${y(82)} Q${x(640)} ${y(72)} ${x(622)} ${y(88)}Z" fill="${scene.glacier}"/>`;
  s +=
    `<path d="M${x(97)} ${y(14)} L${x(120)} ${y(30)} Q${x(170)} ${y(70)} ${x(220)} ${y(40)} L${x(236)} ${y(30)} ` +
    `Q${x(214)} ${y(22)} ${x(196)} ${y(32)} Q${x(176)} ${y(16)} ${x(156)} ${y(30)} Q${x(124)} ${y(6)} ${x(97)} ${y(14)}Z" fill="${scene.glacier}"/>`;
  return s;
}

function lupines(points: readonly (readonly [number, number])[], scale: number): string {
  let s = "";
  for (const [x, y] of points) {
    for (const [dx, height] of [
      [-9, 22],
      [0, 30],
      [9, 20],
    ] as const) {
      const h = height * scale;
      const px = x + dx * scale;
      s += `<path d="M${px.toFixed(1)} ${y.toFixed(1)} L${px.toFixed(1)} ${(y - h).toFixed(1)}" stroke="${light.primary}" stroke-width="${(2.4 * scale).toFixed(1)}" stroke-linecap="round"/>`;
      s += `<rect x="${(px - 3.4 * scale).toFixed(1)}" y="${(y - h - 2 * scale).toFixed(1)}" width="${(6.8 * scale).toFixed(1)}" height="${(h * 0.62).toFixed(1)}" rx="${(3.4 * scale).toFixed(1)}" fill="${people.lupine}"/>`;
    }
  }
  return s;
}

function landscape(width: number, height: number, horizon: number, roadY: number): string {
  const k = width / 1080;
  const hills = roadY - 70;
  let s = `<circle cx="${(width * 0.915).toFixed(1)}" cy="${(horizon - 50).toFixed(1)}" r="48" fill="${people.sun}"/>`;
  s += mountains(width, horizon, roadY, 0.95);
  s +=
    `<path d="M${-20 * k} ${hills + 10} Q${140 * k} ${hills - 50} ${330 * k} ${hills - 6} Q${520 * k} ${hills + 30} ${700 * k} ${hills - 24} ` +
    `Q${880 * k} ${hills - 62} ${1100 * k} ${hills - 4} L${1100 * k} ${roadY} L${-20 * k} ${roadY}Z" fill="${people.mossLight}"/>`;
  s += lupines(
    [
      [170 * k, hills + 34],
      [430 * k, hills + 44],
      [900 * k, hills + 30],
    ],
    1.15 * k,
  );
  s += `<rect x="-10" y="${roadY - 22}" width="${width + 20}" height="8" fill="${light.primary}"/>`;
  s += `<rect x="-10" y="${roadY - 16}" width="${width + 20}" height="46" fill="${icelandScene.dark.road}"/>`;
  for (let i = -1; i < width / 96 + 2; i += 1) {
    s += `<rect x="${i * 96 + 20}" y="${roadY + 5}" width="44" height="5" rx="2.5" fill="${light.surface}" opacity="0.85"/>`;
  }
  s += `<rect x="-10" y="${roadY + 30}" width="${width + 20}" height="${height}" fill="${light.primary}"/>`;
  return s;
}

/** A meeting point: a moss pin with a white dot on a grey pole. */
function pin(cx: number, ground: number, height: number): string {
  const pole = height * 0.42;
  const r = height * 0.29;
  const top = ground - pole;
  const head = top - r * 0.9;
  return (
    `<path d="M${cx} ${ground} L${cx} ${(top + r * 0.2).toFixed(1)}" stroke="${light.control}" stroke-width="${(height * 0.07).toFixed(1)}" stroke-linecap="round"/>` +
    `<path d="M${cx} ${(top + r * 0.55).toFixed(1)} C${(cx - r * 0.35).toFixed(1)} ${top.toFixed(1)} ${(cx - r).toFixed(1)} ${(head + r * 0.6).toFixed(1)} ${(cx - r).toFixed(1)} ${head.toFixed(1)} ` +
    `A${r.toFixed(1)} ${r.toFixed(1)} 0 1 1 ${(cx + r).toFixed(1)} ${head.toFixed(1)} C${(cx + r).toFixed(1)} ${(head + r * 0.6).toFixed(1)} ${(cx + r * 0.35).toFixed(1)} ${top.toFixed(1)} ${cx} ${(top + r * 0.55).toFixed(1)}Z" fill="${light.primary}"/>` +
    `<circle cx="${cx}" cy="${head.toFixed(1)}" r="${(r * 0.42).toFixed(1)}" fill="${light.surface}"/>`
  );
}

/** The car with its wheels on the road, its left bumper at x, and the free-seats tag over its back window. */
function carOnRoad(x: number, roadY: number, width: number, tag: string | null): string {
  const scale = width / carBox.width;
  const height = carBox.height * scale;
  const top = roadY + 8 - (carBox.wheelBottom - carBox.y) * scale;
  let s = "";
  for (const [dy, length] of [
    [62, 70],
    [78, 96],
    [94, 60],
  ] as const) {
    const y = top + (dy - carBox.y) * scale;
    s += `<path d="M${(x - 18 - length).toFixed(1)} ${y.toFixed(1)} L${(x - 18).toFixed(1)} ${y.toFixed(1)}" stroke="${light.control}" stroke-width="2.6" stroke-linecap="round"/>`;
  }
  s += `<svg x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" viewBox="${carBox.x} ${carBox.y} ${carBox.width} ${carBox.height}">${car}</svg>`;
  if (tag !== null) {
    // The arrow's tip at the top of the empty back window.
    const tipX = x + (54 - carBox.x) * scale;
    const tipY = top + (35 - carBox.y) * scale;
    const size = styles.tag.size;
    const w = textWidth(tag, "tag") + size * 1.3;
    const h = size * 1.6;
    const right = tipX + 18;
    const y = tipY - 14 - h;
    s += `<rect x="${(right - w).toFixed(1)}" y="${(y + 4).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h / 2).toFixed(1)}" fill="${light.primaryEdge}"/>`;
    s += `<rect x="${(right - w).toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h / 2).toFixed(1)}" fill="${light.primary}"/>`;
    s += `<path d="M${(tipX - 11).toFixed(1)} ${(y + h - 1).toFixed(1)} L${tipX.toFixed(1)} ${(tipY - 1).toFixed(1)} L${(tipX + 11).toFixed(1)} ${(y + h - 1).toFixed(1)}Z" fill="${light.primary}"/>`;
    s += textElement(tag, "tag", right - w / 2, y + h * 0.68, {
      fill: light.surface,
      anchor: "middle",
    });
  }
  return s;
}

/** PuffinRide's icon and name, side by side, centred on cx. */
function lockup(cx: number, top: number, size: number): string {
  const nameSize = size * 0.6;
  const gap = size * 0.25;
  const total = size + gap + textWidth("PuffinRide", "name", nameSize);
  const left = cx - total / 2;
  return (
    `<defs><clipPath id="icon-corners"><rect width="100" height="100" rx="22.5"/></clipPath></defs>` +
    `<svg x="${left.toFixed(1)}" y="${top}" width="${size}" height="${size}" viewBox="0 0 100 100"><g clip-path="url(#icon-corners)">${icon}</g></svg>` +
    textElement("PuffinRide", "name", left + size + gap, top + size * 0.5 + nameSize * 0.36, {
      size: nameSize,
    })
  );
}

/** A right-pointing arrow, as the app's route arrow, with its left end at x on the line's middle. */
function routeArrow(x: number, middle: number, size: number): string {
  const { width } = arrow(size);
  const head = width * 0.42;
  const stroke = (size * 0.085).toFixed(1);
  return (
    `<path d="M${x.toFixed(1)} ${middle.toFixed(1)} H${(x + width).toFixed(1)} M${(x + width - head).toFixed(1)} ${(middle - head).toFixed(1)} ` +
    `L${(x + width).toFixed(1)} ${middle.toFixed(1)} L${(x + width - head).toFixed(1)} ${(middle + head).toFixed(1)}" ` +
    `fill="none" stroke="${light.primary}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

/** The picture as SVG, 1200 by 630. */
export function rideSvg(ride: Ride, locale: Locale): string {
  const { width: W, height: H } = pictureSize;
  const t = createTranslator(locale);
  const layout = layOutRide(ride, locale);
  const roadY = H - 62;
  const horizon = roadY - 150;
  let s = `<rect width="${W}" height="${H}" fill="${light.background}"/>`;
  s += landscape(W, H, horizon, roadY);
  s += pin(W * 0.1, roadY - 20, 84) + pin(W * 0.9, roadY - 20, 84);
  const carWidth = 330;
  s += carOnRoad(
    W / 2 - carWidth / 2 + 24,
    roadY,
    carWidth,
    ride.bookable ? t("seo.tripFreeSeats") : null,
  );

  s += lockup(W / 2, 30, 44);
  const { lines, size, widths } = layout.route;
  const lineHeight = size * 1.08;
  let baseline = (lines.length === 1 ? 104 : 100) + size * 0.76;
  const { width: arrowWidth, gap } = arrow(size);
  lines.forEach((line, index) => {
    const left = W / 2 - (widths[index] ?? 0) / 2;
    const middle = baseline - size * 0.3;
    const [a = "", b] = line;
    if (b === undefined) {
      s += textElement(a, "route", left, baseline, { size });
    } else if (a === "") {
      s += routeArrow(left, middle, size);
      s += textElement(b, "route", left + arrowWidth + gap, baseline, { size });
    } else {
      s += textElement(a, "route", left, baseline, { size });
      const arrowLeft = left + textWidth(a, "route", size) + gap;
      s += routeArrow(arrowLeft, middle, size);
      s += textElement(b, "route", arrowLeft + arrowWidth + gap, baseline, { size });
    }
    if (index < lines.length - 1) baseline += lineHeight;
  });
  baseline += 52;
  s += textElement(layout.when, "when", W / 2, baseline, { anchor: "middle" });
  if (layout.stops !== null) {
    s += textElement(layout.stops, "stops", W / 2, baseline + 42, {
      anchor: "middle",
      fill: light.textMuted,
    });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}</svg>`;
}

/** The picture as a PNG (item 5), drawn off the main thread. */
export async function drawRide(ride: Ride, locale: Locale): Promise<Buffer> {
  return (await renderAsync(rideSvg(ride, locale), renderOptions)).asPng();
}

export interface RidePictures {
  /**
   * A ride's picture, drawn once and then kept while what it shows stays the
   * same; undefined when as many are being drawn as may be at once.
   */
  picture(ride: Ride, locale: Locale): Promise<Buffer | undefined>;
}

/**
 * The pictures the API keeps (item 4). A picture takes tens of milliseconds
 * of a small server's processor, and sites read one link many times, so the
 * API keeps the last `capacity` pictures (about 70 kB each) and draws at
 * most `drawingAtOnce` at a time.
 */
export function createRidePictures({ capacity = 100, drawingAtOnce = 2 } = {}): RidePictures {
  const kept = new Map<string, Buffer>();
  let drawing = 0;
  return {
    async picture(ride, locale) {
      const key = [ride.id, ride.board, ride.alight, rideVersion(ride, locale)].join(" ");
      const known = kept.get(key);
      if (known !== undefined) {
        // Most recently used last, so the oldest is first to go.
        kept.delete(key);
        kept.set(key, known);
        return known;
      }
      if (drawing >= drawingAtOnce) return undefined;
      drawing += 1;
      try {
        const png = await drawRide(ride, locale);
        kept.set(key, png);
        for (const oldest of kept.keys()) {
          if (kept.size <= capacity) break;
          kept.delete(oldest);
        }
        return png;
      } finally {
        drawing -= 1;
      }
    },
  };
}
