// Posting a trip again, or its return (spec 6, 3.6; feature C6): the new
// draft starts from the trip's stops. Distances, typical times and prices
// are worked out again from the legs, as legs are directional.

/** A stop of the trip, and whether its meeting point is still offered for new trips (spec 2). */
export interface StopToCopy {
  readonly meetingPointId: string;
  readonly offered: boolean;
}

/**
 * The new draft's stops: the same, or reversed for the return. Points no
 * longer offered are left out and named, so the builder can say so
 * (3.6.3); publishing checks there are still enough stops.
 */
export function stopsToCopy(
  stops: readonly StopToCopy[],
  options: { readonly reverse: boolean },
): { readonly stops: string[]; readonly dropped: string[] } {
  const ordered = options.reverse ? [...stops].reverse() : stops;
  return {
    stops: ordered.filter((stop) => stop.offered).map((stop) => stop.meetingPointId),
    dropped: ordered.filter((stop) => !stop.offered).map((stop) => stop.meetingPointId),
  };
}
