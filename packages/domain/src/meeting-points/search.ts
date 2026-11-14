// Place search (spec 2, section 3.4): one field wherever a place is chosen.
// Names are compared in a plain ASCII form, so "thorlakshofn" finds
// Þorlákshöfn, and small typos are tolerated.

/** Letters that do not lose their accent by Unicode decomposition (rule R2.6). */
const spelledOut: Readonly<Record<string, string>> = {
  þ: "th",
  ð: "d",
  æ: "ae",
  ø: "o",
  œ: "oe",
  ß: "ss",
};

/**
 * Lower case, Icelandic letters spelt in ASCII (þ→th, ð→d, æ→ae, accents
 * dropped), and anything else that is not a letter or digit as a single
 * space (rule R2.6). Stored names and queries go through the same rule.
 */
export function normaliseSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[þðæøœß]/gu, (letter) => spelledOut[letter] ?? letter)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/** How well a query matches a place: the order of the results (spec 2, 3.4.4). */
export type PlaceMatchQuality = "exact" | "prefix" | "alias" | "close";

const qualityOrder: readonly PlaceMatchQuality[] = ["exact", "prefix", "alias", "close"];

/** The shortest query that gives results: from the second character (spec 2, 3.4.1). */
export const minimumQueryLength = 2;
/** Typos are tolerated from this many letters on. */
const typoFromLength = 4;

/** How many typos a query of this length may have: 1, or 2 from 8 letters. */
function typosAllowed(length: number): number {
  if (length < typoFromLength) return 0;
  return length < 8 ? 1 : 2;
}

/**
 * Edits (insert, delete, change, swap two neighbours) between two words,
 * stopping early once above `limit`.
 */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let beforePrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMinimum = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (beforePrevious[j - 2] ?? 0) + 1);
      }
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > limit) return limit + 1;
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length] ?? limit + 1;
}

/**
 * The text from each of its words on: what a query may match the start of.
 * "bsi bus terminal" gives "bsi bus terminal", "bus terminal" and "terminal".
 */
function startsOf(text: string): string[] {
  const words = text.split(" ");
  return words.map((_, index) => words.slice(index).join(" "));
}

/** Within a typo or two of the text, or of its start, from any word on. */
function isClose(query: string, text: string): boolean {
  const allowed = typosAllowed(query.length);
  if (allowed === 0) return false;
  return startsOf(text).some(
    (start) =>
      editDistance(query, start, allowed) <= allowed ||
      editDistance(query, start.slice(0, query.length), allowed) <= allowed,
  );
}

/**
 * How a query matches a place or meeting point, or null when it does not.
 * A name that equals the query is exact; a name, or a word in it, that
 * starts with it is a prefix; then aliases; then names and aliases within
 * a typo or two (spec 2, section 3.4).
 */
export function placeMatch(
  query: string,
  candidate: { readonly names: readonly string[]; readonly aliases: readonly string[] },
): PlaceMatchQuality | null {
  const q = normaliseSearchText(query);
  if (q.length < minimumQueryLength) return null;
  const names = candidate.names.map(normaliseSearchText);
  const aliases = candidate.aliases.map(normaliseSearchText);
  if (names.includes(q)) return "exact";
  if (names.some((name) => startsOf(name).some((start) => start.startsWith(q)))) {
    return "prefix";
  }
  if (aliases.some((alias) => startsOf(alias).some((start) => start.startsWith(q)))) {
    return "alias";
  }
  if ([...names, ...aliases].some((text) => isClose(q, text))) return "close";
  return null;
}

export interface PlaceCandidate {
  readonly id: string;
  readonly kind: "meetingPoint" | "place";
  /** The name in Icelandic first, then in English where it differs. */
  readonly names: readonly string[];
  readonly aliases: readonly string[];
}

export interface RankedPlace<C extends PlaceCandidate> {
  readonly id: string;
  readonly quality: PlaceMatchQuality;
  readonly candidate: C;
}

/**
 * The candidates that match, best first: by match quality, then meeting
 * points before places, then by name (spec 2, 3.4.4).
 */
export function rankPlaceMatches<C extends PlaceCandidate>(
  query: string,
  candidates: readonly C[],
  limit = 10,
): RankedPlace<C>[] {
  const sortName = (candidate: C) => normaliseSearchText(candidate.names[0] ?? "");
  return candidates
    .flatMap((candidate) => {
      const quality = placeMatch(query, candidate);
      return quality === null ? [] : [{ id: candidate.id, quality, candidate }];
    })
    .sort(
      (a, b) =>
        qualityOrder.indexOf(a.quality) - qualityOrder.indexOf(b.quality) ||
        Number(a.candidate.kind === "place") - Number(b.candidate.kind === "place") ||
        sortName(a.candidate).localeCompare(sortName(b.candidate), "en"),
    )
    .slice(0, limit);
}
