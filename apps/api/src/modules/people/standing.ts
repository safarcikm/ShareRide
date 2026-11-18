// How people stand beside their name on trips, requests and bookings (spec 4,
// 3.4 and 3.6; spec 5, 3.3.2): their rating and the reliability figure's
// share kept, as on their profile.
import type { Standing } from "@shareride/contracts";
import { defaultReliabilitySettings, type ReliabilitySettings } from "@shareride/domain";
import type { Queryable } from "../bookings/seats.ts";
import { ratingsOf } from "./ratings.ts";
import { reliabilityOfPeople } from "./reliability.ts";

/** No rating and too few trips: someone new, or someone nobody sees any more. */
export const newcomer: Standing = {
  rating: { average: null, count: 0 },
  reliabilityPercent: null,
};

/** The standing of each of these people, now; anyone else's is a newcomer's. */
export async function standingsOf(
  q: Queryable,
  userIds: readonly string[],
  now: Date,
  settings: ReliabilitySettings = defaultReliabilitySettings,
): Promise<(userId: string) => Standing> {
  const [ratings, figures] = await Promise.all([
    ratingsOf(q, userIds),
    reliabilityOfPeople(q, userIds, now, settings),
  ]);
  return (userId) => ({
    rating: ratings.get(userId) ?? newcomer.rating,
    reliabilityPercent: figures.get(userId)?.percent ?? null,
  });
}
