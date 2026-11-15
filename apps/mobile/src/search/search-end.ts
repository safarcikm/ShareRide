import type { PlaceSearchResult } from "@shareride/contracts";
import type { SearchEnd } from "./recent-searches";

/**
 * What a search covers for a place search result (spec 4, 3.2): the meeting
 * point, which also covers the points near it, or the whole town, which
 * covers its own. Either is chosen at once.
 */
export function searchEndOf(result: PlaceSearchResult): SearchEnd {
  return result.kind === "meetingPoint"
    ? { id: result.meetingPoint.id, name: result.meetingPoint.name }
    : { id: result.place.id, name: result.place.name };
}
