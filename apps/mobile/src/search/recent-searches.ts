// The last five searches, kept on this device only (spec 4, 3.1 and section
// 7): never sent to the API or stored with an account.
import type { MeetingPointSummary } from "@shareride/contracts";
import { readPreference, writePreference } from "@/lib/preferences";

/** A name in Icelandic and English. */
export type LocalisedText = MeetingPointSummary["name"];

/** A meeting point or place searched from or to, with its name for the screen. */
export interface SearchEnd {
  readonly id: string;
  readonly name: LocalisedText;
}

export interface SearchQuery {
  readonly from: SearchEnd;
  readonly to: SearchEnd;
  /** "2026-11-20", or null for any day. */
  readonly date: string | null;
  readonly seats: number;
}

const storageKey = "recentSearches";
export const recentLimit = 5;

const isText = (value: unknown): value is LocalisedText =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Record<string, unknown>)["is"] === "string" &&
  typeof (value as Record<string, unknown>)["en"] === "string";

const isEnd = (value: unknown): value is SearchEnd =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Record<string, unknown>)["id"] === "string" &&
  isText((value as Record<string, unknown>)["name"]);

function isQuery(value: unknown): value is SearchQuery {
  if (typeof value !== "object" || value === null) return false;
  const { from, to, date, seats } = value as Record<string, unknown>;
  return (
    isEnd(from) &&
    isEnd(to) &&
    (date === null || (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))) &&
    typeof seats === "number" &&
    Number.isInteger(seats) &&
    seats >= 1
  );
}

const sameSearch = (a: SearchQuery, b: SearchQuery) =>
  a.from.id === b.from.id && a.to.id === b.to.id && a.date === b.date && a.seats === b.seats;

/**
 * The saved searches, newest first, as of `today` ("2026-11-14"): a date
 * that has passed becomes any day, and repeats that leaves are dropped.
 * Anything unreadable is left out.
 */
export async function loadRecentSearches(today: string): Promise<SearchQuery[]> {
  const stored = await readPreference(storageKey);
  if (stored === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const recent: SearchQuery[] = [];
  for (const query of parsed.filter(isQuery)) {
    const current = query.date !== null && query.date < today ? { ...query, date: null } : query;
    if (!recent.some((found) => sameSearch(found, current))) recent.push(current);
  }
  return recent.slice(0, recentLimit);
}

/** Puts `query` first, without repeats, and keeps the newest five. */
export async function saveRecentSearch(query: SearchQuery, today: string): Promise<SearchQuery[]> {
  const earlier = await loadRecentSearches(today);
  const recent = [query, ...earlier.filter((found) => !sameSearch(found, query))].slice(
    0,
    recentLimit,
  );
  await writePreference(storageKey, JSON.stringify(recent));
  return recent;
}

/** Forgets every saved search on this device. */
export async function clearRecentSearches(): Promise<void> {
  await writePreference(storageKey, JSON.stringify([]));
}
