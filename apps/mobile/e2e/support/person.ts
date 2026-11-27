import type { Page } from "@playwright/test";
import type { ProfileReview, PublicProfile } from "@shareride/contracts";

// A made-up person and the reviews they were given, shown on their profile
// in place of the test API's answers, for the journeys that look at a
// person's profile (spec 31, 3.19). Nobody real.

/** The made-up person's profile reference. */
export const personId = "6c1b7e0a-41d2-4f0e-9a51-0000000000a1";

const reviewId = (n: number) => `6c1b7e0a-41d2-4f0e-9a51-0000000001${String(n).padStart(2, "0")}`;

/** A driver with a rating, both checks, and a few words about herself. */
export function aPerson(changes: Partial<PublicProfile> = {}): PublicProfile {
  return {
    profileId: personId,
    photo: null,
    firstName: "Bára",
    about:
      "I drive between Reykjavík and Akureyri most weekends. Happy to chat, or to let you sleep.",
    languages: ["is", "en"],
    phoneVerified: true,
    emailVerified: true,
    memberSince: "2026-03",
    colour: 1,
    rating: { average: 4.7, count: 3 },
    reliability: {
      kept: 11,
      counted: 12,
      percent: 91,
      byRole: { driver: { kept: 10, counted: 10 }, passenger: { kept: 1, counted: 2 } },
    },
    ...changes,
  };
}

/** Three reviews, newest first: two from passengers, one from a driver who has left. */
export const somePersonReviews: readonly ProfileReview[] = [
  {
    id: reviewId(1),
    rating: 5,
    comment: "On time, careful on the heath, and good company all the way north.",
    author: { firstName: "Gunnar" },
    authorRole: "passenger",
    writtenIn: "2026-11",
    mine: false,
  },
  {
    id: reviewId(2),
    rating: 4,
    comment: "Easy to travel with.",
    author: { firstName: null },
    authorRole: "driver",
    writtenIn: "2026-10",
    mine: false,
  },
  {
    id: reviewId(3),
    rating: 5,
    comment: "",
    author: { firstName: "Jón" },
    authorRole: "passenger",
    writtenIn: "2026-10",
    mine: false,
  },
];

/**
 * Answers for the person's profile and reviews on this page. The test API
 * knows no such person: its own answer is kept for what a browser wants of
 * an answer from another address, and given this person's in its body.
 */
export async function showPerson(
  page: Page,
  person: PublicProfile,
  reviews: readonly ProfileReview[] = somePersonReviews,
) {
  const profile = `/v1/people/${person.profileId}`;
  await page.route(
    (url) => url.pathname === profile || url.pathname === `${profile}/reviews`,
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      const { pathname, searchParams } = new URL(route.request().url());
      if (pathname === profile) {
        await route.fulfill({ response, status: 200, json: person });
        return;
      }
      // By role as the API does: reviews given as a driver were written by passengers.
      const role = searchParams.get("role");
      const shown = reviews.filter(
        (review) =>
          role === null || review.authorRole === (role === "driver" ? "passenger" : "driver"),
      );
      await route.fulfill({ response, status: 200, json: { reviews: shown, more: false } });
    },
  );
}
