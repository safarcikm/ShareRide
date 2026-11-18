import { err, ok, type Result } from "../result.ts";

// Corridors (spec 10, 3.4.1): the operator's name for a road people drive,
// as an ordered list of places, such as Reykjavík, Hveragerði, Selfoss. The
// weekly figures are counted per corridor.

export const corridorNameMaxLength = 80;
export const corridorMinPlaces = 2;
export const corridorMaxPlaces = 12;

export interface CorridorDraft {
  readonly name: string;
  /** The places along the road, in order. */
  readonly placeIds: readonly string[];
}

export type CorridorProblem =
  | { readonly code: "name_missing" }
  | { readonly code: "name_too_long" }
  | { readonly code: "too_few_places" }
  | { readonly code: "too_many_places" }
  | { readonly code: "place_twice" };

/** A corridor as stored: its name trimmed. */
export function checkCorridor(draft: CorridorDraft): Result<CorridorDraft, CorridorProblem> {
  const name = draft.name.trim();
  if (name.length === 0) return err({ code: "name_missing" });
  if (name.length > corridorNameMaxLength) return err({ code: "name_too_long" });
  if (draft.placeIds.length < corridorMinPlaces) return err({ code: "too_few_places" });
  if (draft.placeIds.length > corridorMaxPlaces) return err({ code: "too_many_places" });
  if (new Set(draft.placeIds).size !== draft.placeIds.length) return err({ code: "place_twice" });
  return ok({ name, placeIds: draft.placeIds });
}

/**
 * Whether a search or a trip belongs to a corridor: both its ends are
 * places on it. An end is given as every place that covers it: the place
 * itself when a place was searched, or each place that covers the meeting
 * point. The two ends must be two different places of the corridor, so a
 * trip inside one town belongs to none.
 */
export function onCorridor(
  corridor: { readonly placeIds: readonly string[] },
  from: readonly string[],
  to: readonly string[],
): boolean {
  const places = new Set(corridor.placeIds);
  const starts = from.filter((id) => places.has(id));
  const ends = to.filter((id) => places.has(id));
  return starts.some((start) => ends.some((end) => end !== start));
}
