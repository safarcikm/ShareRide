import type { PlaceSearchResult } from "@shareride/contracts";
import { router } from "expo-router";

/** Opens what place search found: a meeting point's details, or a place's nearest points. */
export function openSearchResult(result: PlaceSearchResult) {
  if (result.kind === "meetingPoint") {
    router.push({ pathname: "/meeting-points/[id]", params: { id: result.meetingPoint.id } });
  } else {
    router.push({ pathname: "/places/[id]", params: { id: result.place.id } });
  }
}
