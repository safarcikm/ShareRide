// Public profiles and their reviews, for screen tests. Not used by the app
// itself. All made up.
import type { ProfileReview, PublicProfile } from "@shareride/contracts";
import { failure, ok, type FakeClient } from "./fake-client";

/** Anna's profile reference, as trip details gives it to members signed in. */
export const annaProfileId = "6c1b7e0a-41d2-4f0e-9a51-0000000000a1";

/** Anna, who drives the north trip, as anyone signed in sees her. */
export const annaProfile: PublicProfile = {
  profileId: annaProfileId,
  firstName: "Anna",
  about: "I drive between Reykjavík and Akureyri most weekends.",
  languages: ["is", "en"],
  phoneVerified: true,
  emailVerified: false,
  memberSince: "2026-03",
  colour: 1,
  rating: { average: 4.3, count: 3 },
  reliability: {
    kept: 11,
    counted: 12,
    percent: 91,
    byRole: { driver: { kept: 10, counted: 10 }, passenger: { kept: 1, counted: 2 } },
  },
};

/** A review on a profile; `n` tells them apart. */
export function aProfileReview(n: number, changes: Partial<ProfileReview> = {}): ProfileReview {
  return {
    id: `6c1b7e0a-41d2-4f0e-9a51-0000000001${String(n).padStart(2, "0")}`,
    rating: 5,
    comment: "",
    author: { firstName: "Gunna" },
    authorRole: "passenger",
    writtenIn: "2026-10",
    ...changes,
  };
}

/** Anna's reviews, newest first. */
export const annaReviews: readonly ProfileReview[] = [
  aProfileReview(1, { rating: 4, comment: "On time and careful.", writtenIn: "2026-11" }),
  aProfileReview(2, {
    rating: 4,
    comment: "Easy company.",
    author: { firstName: null },
    authorRole: "driver",
  }),
  aProfileReview(3, { author: { firstName: "Jón" } }),
];

/**
 * Answers for profiles: `profiles` by their reference, anything else not
 * found; their reviews newest first, `pageSize` at a time, filtered by role
 * as the API does (reviews given as a driver were written by passengers).
 */
export function profileApi(
  client: FakeClient,
  profiles: readonly PublicProfile[] = [annaProfile],
  reviews: readonly ProfileReview[] = annaReviews,
  pageSize = 20,
) {
  const found = (input: Record<string, unknown>) => {
    const { profileId } = input["params"] as { profileId: string };
    return profiles.find((profile) => profile.profileId === profileId);
  };
  client.answer("/v1/people/{profileId}", (input) => {
    const profile = found(input);
    return profile === undefined ? failure(404, "not_found") : ok(200, profile);
  });
  client.answer("/v1/people/{profileId}/reviews", (input) => {
    if (found(input) === undefined) return failure(404, "not_found");
    const { role, before } = input["query"] as { role?: string; before?: string };
    const shown = reviews.filter(
      (review) =>
        role === undefined || review.authorRole === (role === "driver" ? "passenger" : "driver"),
    );
    const start = before === undefined ? 0 : shown.findIndex((review) => review.id === before) + 1;
    const page = shown.slice(start, start + pageSize);
    return ok(200, { reviews: page, more: start + pageSize < shown.length });
  });
}
