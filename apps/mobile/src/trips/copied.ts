import type { MeetingPointSummary } from "@shareride/contracts";

// The meeting points a copy of a trip left out as no longer in use (spec 6,
// 3.6), handed from the trip page to the new draft's date and times step,
// which names them in the app's language. Kept in memory only: after a
// reload the step does not say so, and the draft is right either way.
const left = new Map<string, readonly MeetingPointSummary[]>();

export function rememberDropped(draftId: string, points: readonly MeetingPointSummary[]): void {
  if (points.length > 0) left.set(draftId, points);
}

/** The meeting points left out of this draft when it was copied; none for any other. */
export function droppedFrom(draftId: string): readonly MeetingPointSummary[] {
  return left.get(draftId) ?? [];
}
