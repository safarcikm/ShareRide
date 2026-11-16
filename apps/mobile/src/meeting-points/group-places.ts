import type { PlaceSearchResult } from "@shareride/contracts";

/**
 * Towns and areas apart from meeting points, for the From and To list
 * (spec 16, 3.8), each in the order the API gave.
 */
export function groupPlaces(results: readonly PlaceSearchResult[]): {
  places: PlaceSearchResult[];
  meetingPoints: PlaceSearchResult[];
} {
  return {
    places: results.filter((result) => result.kind === "place"),
    meetingPoints: results.filter((result) => result.kind === "meetingPoint"),
  };
}
