// Reading a meeting point's spot from what the operator pastes: coordinates
// in the usual forms, or a link from a map (spec 2, 3.6; milestone 8 plan,
// decision 3). Only spots in and around Iceland are taken.

/** WGS 84, as GPS and maps use. */
export interface Position {
  readonly latitude: number;
  readonly longitude: number;
}

/** A box around Iceland with its islands, Vestmannaeyjar to Grímsey. */
export const icelandBounds = { west: -24.7, east: -13.2, south: 63.2, north: 66.7 } as const;

export type CoordinatesResult =
  | { readonly ok: true; readonly position: Position }
  | { readonly ok: false; readonly problem: "unreadable" | "outside_iceland" };

const number = String.raw`-?\d+(?:\.\d+)?`;
const decimalPair = new RegExp(String.raw`^\s*(${number})\s*,\s*(${number})\s*$`);

/**
 * The spot in `text`: decimal degrees ("64.137133, -21.933689"), degrees and
 * minutes, degrees, minutes and seconds, with N, S, E and W (or the
 * Icelandic V and A) before or after, or a Google Maps, Apple Maps or
 * OpenStreetMap link. Kept to six decimals, about ten centimetres.
 */
export function parseCoordinates(text: string): CoordinatesResult {
  const trimmed = text.trim();
  const pair = /^https?:\/\//i.test(trimmed) ? fromLink(trimmed) : fromText(trimmed);
  if (pair === null) return { ok: false, problem: "unreadable" };
  const position = { latitude: rounded(pair.latitude), longitude: rounded(pair.longitude) };
  return withinIceland(position)
    ? { ok: true, position }
    : { ok: false, problem: "outside_iceland" };
}

export function withinIceland({ latitude, longitude }: Position): boolean {
  return (
    latitude >= icelandBounds.south &&
    latitude <= icelandBounds.north &&
    longitude >= icelandBounds.west &&
    longitude <= icelandBounds.east
  );
}

const rounded = (degrees: number) => Math.round(degrees * 1e6) / 1e6;

const pairOf = (latitude: string | undefined, longitude: string | undefined): Position | null =>
  latitude === undefined || longitude === undefined
    ? null
    : { latitude: Number(latitude), longitude: Number(longitude) };

function decimalPairIn(value: string | null): Position | null {
  if (value === null) return null;
  const match = decimalPair.exec(value);
  return match === null ? null : pairOf(match[1], match[2]);
}

/** A link's path, query parameters and fragment, without the platform's URL class. */
function partsOf(link: string): {
  path: string;
  params: Map<string, string>;
  fragment: string;
} | null {
  const [beforeFragment = "", fragment = ""] = link.split(/#(.*)/s);
  const [path = "", query = ""] = beforeFragment.split(/\?(.*)/s);
  const params = new Map<string, string>();
  for (const pair of query.split("&")) {
    if (pair === "") continue;
    const [key = "", value = ""] = pair.split(/=(.*)/s);
    try {
      const name = decodeURIComponent(key.replaceAll("+", " "));
      if (!params.has(name)) params.set(name, decodeURIComponent(value.replaceAll("+", " ")));
    } catch {
      return null;
    }
  }
  return { path, params, fragment };
}

/** A map link: its pin or marker first, then the middle of its view. */
function fromLink(link: string): Position | null {
  const parts = partsOf(link);
  if (parts === null) return null;
  const { path, params, fragment } = parts;
  // Google Maps puts a place's own spot after !3d and !4d.
  const pin = new RegExp(String.raw`!3d(${number})!4d(${number})`).exec(path);
  if (pin !== null) return pairOf(pin[1], pin[2]);
  // OpenStreetMap's marker.
  const [mlat, mlon] = [params.get("mlat") ?? "", params.get("mlon") ?? ""];
  if (new RegExp(`^${number}$`).test(mlat) && new RegExp(`^${number}$`).test(mlon)) {
    return pairOf(mlat, mlon);
  }
  // Apple Maps' coordinate and ll, Google Maps' query and q.
  for (const key of ["coordinate", "ll", "query", "q", "sll"]) {
    const found = decimalPairIn(params.get(key) ?? null);
    if (found !== null) return found;
  }
  // The view: Google Maps' @lat,lon and OpenStreetMap's #map=zoom/lat/lon.
  const view = new RegExp(String.raw`/@(${number}),(${number})`).exec(path);
  if (view !== null) return pairOf(view[1], view[2]);
  const osm = new RegExp(String.raw`^map=[\d.]+/(${number})/(${number})`).exec(fragment);
  if (osm !== null) return pairOf(osm[1], osm[2]);
  return null;
}

type Token =
  | { readonly kind: "number"; readonly text: string }
  | { readonly kind: "degrees" | "minutes" | "seconds" | "separator" }
  | { readonly kind: "hemisphere"; readonly letter: "N" | "S" | "E" | "W" };

const hemispheres: Record<string, "N" | "S" | "E" | "W"> = {
  N: "N",
  S: "S",
  E: "E",
  W: "W",
  // Icelandic: vestur and austur.
  V: "W",
  A: "E",
};

const tokenPattern = new RegExp(
  String.raw`\s*(?:(${number})|([°º])|(''|["″”])|(['′’])|([NSEWVA])|([,;]))`,
  "iy",
);

function tokensOf(text: string): Token[] | null {
  const tokens: Token[] = [];
  tokenPattern.lastIndex = 0;
  while (tokenPattern.lastIndex < text.length) {
    const start = tokenPattern.lastIndex;
    const match = tokenPattern.exec(text);
    if (match === null || tokenPattern.lastIndex === start) {
      return text.slice(start).trim() === "" ? tokens : null;
    }
    const [, value, degrees, seconds, minutes, letter] = match;
    if (value !== undefined) tokens.push({ kind: "number", text: value });
    else if (degrees !== undefined) tokens.push({ kind: "degrees" });
    else if (seconds !== undefined) tokens.push({ kind: "seconds" });
    else if (minutes !== undefined) tokens.push({ kind: "minutes" });
    else if (letter !== undefined) {
      const hemisphere = hemispheres[letter.toUpperCase()];
      if (hemisphere === undefined) return null;
      tokens.push({ kind: "hemisphere", letter: hemisphere });
    } else tokens.push({ kind: "separator" });
  }
  return tokens;
}

/** Degrees, then minutes, then seconds; each part below 60 and only the last with decimals. */
function angleOf(numbers: readonly string[], signed: boolean): number | null {
  if (numbers.length < 1 || numbers.length > 3) return null;
  const parts = numbers.map(Number);
  const [degrees = 0, minutes = 0, seconds = 0] = parts;
  if (numbers.slice(1).some((part) => part.startsWith("-"))) return null;
  if (!signed && degrees < 0) return null;
  if (numbers.slice(0, -1).some((part) => part.includes("."))) return null;
  if (minutes >= 60 || seconds >= 60) return null;
  const size = Math.abs(degrees) + minutes / 60 + seconds / 3600;
  return numbers[0]?.startsWith("-") === true ? -size : size;
}

/** Splits numbers into the two angles: at hemisphere letters, separators or degree signs. */
function fromText(text: string): Position | null {
  const tokens = tokensOf(text);
  if (tokens === null) return null;
  const letters = tokens.filter((token) => token.kind === "hemisphere");
  if (letters.length > 0) return withHemispheres(tokens);

  const groups: string[][] = [[]];
  const hasSeparator = tokens.some((token) => token.kind === "separator");
  const hasDegreeSigns = tokens.some((token) => token.kind === "degrees");
  tokens.forEach((token, index) => {
    const current = groups.at(-1) ?? [];
    if (token.kind === "separator") {
      groups.push([]);
    } else if (token.kind === "number") {
      const startsAngle =
        !hasSeparator &&
        current.length > 0 &&
        (hasDegreeSigns ? tokens[index + 1]?.kind === "degrees" : true);
      if (startsAngle) groups.push([token.text]);
      else current.push(token.text);
    }
  });
  if (groups.length !== 2) return null;
  const [first = [], second = []] = groups;
  const latitude = angleOf(first, true);
  const longitude = angleOf(second, true);
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

/** Each angle is the numbers next to its letter: all before it, or all after it. */
function withHemispheres(tokens: readonly Token[]): Position | null {
  const prefix = tokens[0]?.kind === "hemisphere";
  const angles: { letter: "N" | "S" | "E" | "W"; numbers: string[] }[] = [];
  let numbers: string[] = [];
  for (const token of tokens) {
    if (token.kind === "number") numbers.push(token.text);
    if (token.kind !== "hemisphere") continue;
    if (prefix) {
      const last = angles.at(-1);
      if (last !== undefined) last.numbers = numbers;
      angles.push({ letter: token.letter, numbers: [] });
    } else {
      angles.push({ letter: token.letter, numbers });
    }
    numbers = [];
  }
  if (prefix) {
    const last = angles.at(-1);
    if (last !== undefined) last.numbers = numbers;
  } else if (numbers.length > 0) {
    return null;
  }
  if (angles.length !== 2) return null;
  const north = angles.find((angle) => angle.letter === "N" || angle.letter === "S");
  const east = angles.find((angle) => angle.letter === "E" || angle.letter === "W");
  if (north === undefined || east === undefined) return null;
  const latitude = angleOf(north.numbers, false);
  const longitude = angleOf(east.numbers, false);
  if (latitude === null || longitude === null) return null;
  return {
    latitude: north.letter === "S" ? -latitude : latitude,
    longitude: east.letter === "W" ? -longitude : longitude,
  };
}
