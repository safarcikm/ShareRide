import {
  profileReviewsPageSize,
  profileReviewsRoute,
  publicProfileRoute,
  type ProfileReview,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { defaultTripDaySettings as settings } from "@shareride/domain";
import { desc, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { moveTripsOn } from "../trips/completion.ts";

// Public profiles (spec 1, 3.5; spec 8, 3.7 and 3.8). At the test clock
// (Friday 13 November 2026, noon), Jón's airport trip leaves Hlemmur on
// Saturday at 05:30; Gunna books Hlemmur to Fjörður on it. All made up.

let api: TestApi;

const { airport, north, vik } = sampleTrip;
const { bookings, disputes, reviews, trips, users } = schema;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, booked, paid } = bookingHelpers(() => api);

const minuteMs = 60_000;
const dayMs = 86_400_000;
const at = (time: Date, minutes: number) => new Date(time.getTime() + minutes * minuteMs);

async function profileIdOf(member: Member) {
  const [found] = await api.connection.db
    .select({ profileId: users.profileId })
    .from(users)
    .where(eq(users.id, member.userId));
  if (found === undefined) throw new Error("No such member.");
  return found.profileId;
}

const profileOf = (viewer: Member, profileId: string) =>
  api.client.call(publicProfileRoute, {
    accessToken: viewer.accessToken,
    params: { profileId },
  });

async function shownProfile(viewer: Member, member: Member) {
  const result = await profileOf(viewer, await profileIdOf(member));
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}

const reviewsOf = (
  viewer: Member,
  profileId: string,
  query: { role?: "driver" | "passenger"; before?: string } = {},
) =>
  api.client.call(profileReviewsRoute, {
    accessToken: viewer.accessToken,
    params: { profileId },
    query,
  });

async function shownReviews(viewer: Member, member: Member, query = {}) {
  const result = await reviewsOf(viewer, await profileIdOf(member), query);
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}

/** Jón drove Gunna from Hlemmur to Fjörður; the trip completed half an hour ago. */
async function afterTheTrip() {
  const jon = await driverOf(airport, "Jón");
  const gunna = await newMember("Gunna");
  const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
  await paid(gunna.accessToken, booking.id);
  const [last] = await api.connection.db
    .select({ plannedAt: schema.tripStops.plannedAt })
    .from(schema.tripStops)
    .where(eq(schema.tripStops.tripId, airport))
    .orderBy(desc(schema.tripStops.position))
    .limit(1);
  if (last === undefined || last.plannedAt === null) {
    throw new Error("A published trip's stop has its time.");
  }
  const seconds = (at(last.plannedAt, 150).getTime() - api.now().getTime()) / 1000;
  await later(Math.round(seconds), jon, gunna);
  await moveTripsOn(api.connection.db, api.now(), settings);
  return { jon, gunna, bookingId: booking.id };
}

/** Another of Gunna's bookings on the airport trip, as `changes` say, copied from `bookingId`. */
async function anotherBooking(bookingId: string, changes: Partial<typeof bookings.$inferInsert>) {
  const { db } = api.connection;
  const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (row === undefined) throw new Error("No such booking.");
  const [copy] = await db
    .insert(bookings)
    .values({ ...row, id: crypto.randomUUID(), attemptKey: crypto.randomUUID(), ...changes })
    .returning({ id: bookings.id });
  if (copy === undefined) throw new Error("Not copied.");
  return copy.id;
}

/** A review on a booking, stored as the review route and the minute job would leave it. */
async function storedReview(
  values: Pick<
    typeof reviews.$inferInsert,
    "bookingId" | "authorId" | "subjectId" | "authorRole" | "rating"
  > &
    Partial<typeof reviews.$inferInsert>,
) {
  const [row] = await api.connection.db
    .insert(reviews)
    .values({ createdAt: api.now(), revealedAt: api.now(), ...values })
    .returning({ id: reviews.id });
  if (row === undefined) throw new Error("Not stored.");
  return row.id;
}

describe("a public profile (spec 1, 3.5)", () => {
  it("shows the first name, about, languages, badges and since when, and nothing private", async () => {
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    await api.connection.db
      .update(users)
      .set({
        about: "Drive to the airport most weeks.",
        languages: ["is", "en"],
        email: "jon@example.com",
        emailVerifiedAt: api.now(),
      })
      .where(eq(users.id, jon.userId));
    const profileId = await profileIdOf(jon);
    const result = await profileOf(gunna, profileId);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data).toMatchObject({
      profileId,
      firstName: "Jón",
      about: "Drive to the airport most weeks.",
      languages: ["is", "en"],
      phoneVerified: true,
      emailVerified: true,
      rating: { average: null, count: 0 },
      reliability: {
        kept: 0,
        counted: 0,
        percent: null,
        byRole: { driver: { kept: 0, counted: 0 }, passenger: { kept: 0, counted: 0 } },
      },
    });
    // Only the month they joined, as on a request (spec 5).
    expect(result.data.memberSince).toMatch(/^\d{4}-\d{2}$/);
    const [{ phone } = { phone: null }] = await api.connection.db
      .select({ phone: users.phoneE164 })
      .from(users)
      .where(eq(users.id, jon.userId));
    if (phone === null) throw new Error("A member signs in with a phone number.");
    const sent = JSON.stringify(result.data);
    expect(sent).not.toContain("jon@example.com");
    expect(sent).not.toContain(jon.userId);
    expect(sent).not.toContain(phone.slice(-7));
  });

  it("gives no about when there is none", async () => {
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    await api.connection.db.update(users).set({ about: "" }).where(eq(users.id, jon.userId));
    expect((await shownProfile(gunna, jon)).about).toBeNull();
  });

  it("is not found by the person's own ID, for someone leaving or for the former member", async () => {
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    expect((await profileOf(gunna, crypto.randomUUID())).status).toBe(404);
    expect((await profileOf(gunna, jon.userId)).status).toBe(404);
    const [former] = await api.connection.db
      .select({ profileId: users.profileId })
      .from(users)
      .where(eq(users.id, schema.formerMemberId));
    if (former === undefined) throw new Error("The former member is made by a migration.");
    expect((await profileOf(gunna, former.profileId)).status).toBe(404);
    const profileId = await profileIdOf(jon);
    await api.connection.db
      .update(users)
      .set({ deleteAfter: at(api.now(), 7 * 24 * 60) })
      .where(eq(users.id, jon.userId));
    expect((await profileOf(gunna, profileId)).status).toBe(404);
    expect((await reviewsOf(gunna, profileId)).status).toBe(404);
  });

  it("is for members who have signed in", async () => {
    const jon = await driverOf(airport, "Jón");
    const profileId = await profileIdOf(jon);
    const result = await api.client.call(publicProfileRoute, { params: { profileId } });
    expect(result.status).toBe(401);
  });

  it("gives each person a different reference", async () => {
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    expect(await profileIdOf(jon)).not.toBe(await profileIdOf(gunna));
  });
});

describe("the rating and reviews on a profile (spec 8, 3.7; R8.9)", () => {
  it("counts and lists only the reviews that show, never one hidden", async () => {
    const { jon, gunna, bookingId } = await afterTheTrip();
    const gunnaOnJon = await storedReview({
      bookingId,
      authorId: gunna.userId,
      subjectId: jon.userId,
      authorRole: "passenger",
      rating: 4,
      comment: "On time and careful.",
      revealedAt: null,
    });
    expect((await shownProfile(gunna, jon)).rating).toEqual({ average: null, count: 0 });
    expect((await shownReviews(gunna, jon)).reviews).toEqual([]);

    await api.connection.db
      .update(reviews)
      .set({ revealedAt: api.now() })
      .where(eq(reviews.id, gunnaOnJon));
    expect((await shownProfile(gunna, jon)).rating).toEqual({ average: 4, count: 1 });
    const shown = await shownReviews(gunna, jon);
    expect(shown).toEqual({
      reviews: [
        {
          id: gunnaOnJon,
          rating: 4,
          comment: "On time and careful.",
          author: { firstName: "Gunna" },
          authorRole: "passenger",
          writtenIn: "2026-11",
        },
      ],
      more: false,
    });

    await api.connection.db
      .update(reviews)
      .set({ hiddenAt: api.now() })
      .where(eq(reviews.id, gunnaOnJon));
    expect((await shownProfile(gunna, jon)).rating).toEqual({ average: null, count: 0 });
    expect((await shownReviews(gunna, jon)).reviews).toEqual([]);
  });

  it("leaves out what someone leaving ShareRide wrote (spec 11, 3.4.3)", async () => {
    const { jon, gunna, bookingId } = await afterTheTrip();
    await storedReview({
      bookingId,
      authorId: gunna.userId,
      subjectId: jon.userId,
      authorRole: "passenger",
      rating: 2,
    });
    await api.connection.db
      .update(users)
      .set({ deleteAfter: at(api.now(), 7 * 24 * 60) })
      .where(eq(users.id, gunna.userId));
    const sigga = await newMember("Sigga");
    expect((await shownProfile(sigga, jon)).rating).toEqual({ average: null, count: 0 });
    expect((await shownReviews(sigga, jon)).reviews).toEqual([]);
  });

  it("averages to one decimal, by role, and names a former member as such", async () => {
    const { jon, gunna, bookingId } = await afterTheTrip();
    const other = await anotherBooking(bookingId, {});
    await storedReview({
      bookingId,
      authorId: gunna.userId,
      subjectId: jon.userId,
      authorRole: "passenger",
      rating: 4,
    });
    await storedReview({
      bookingId: other,
      authorId: gunna.userId,
      subjectId: jon.userId,
      authorRole: "passenger",
      rating: 5,
      createdAt: at(api.now(), 1),
    });
    const third = await anotherBooking(bookingId, {});
    // Jón rode as a passenger once, with Ari driving, who has since been erased.
    await storedReview({
      bookingId: third,
      authorId: schema.formerMemberId,
      subjectId: jon.userId,
      authorRole: "driver",
      rating: 4,
      comment: "Easy company.",
      createdAt: at(api.now(), 2),
    });
    expect((await shownProfile(gunna, jon)).rating).toEqual({ average: 4.3, count: 3 });

    const all = await shownReviews(gunna, jon);
    expect(all.reviews.map((one) => [one.rating, one.author.firstName, one.authorRole])).toEqual([
      [4, null, "driver"],
      [5, "Gunna", "passenger"],
      [4, "Gunna", "passenger"],
    ]);
    const asPassenger = await shownReviews(gunna, jon, { role: "passenger" });
    expect(asPassenger.reviews.map((one) => one.comment)).toEqual(["Easy company."]);
    const asDriver = await shownReviews(gunna, jon, { role: "driver" });
    expect(asDriver.reviews.map((one) => one.rating)).toEqual([5, 4]);
  });

  it("comes in pages, newest first", async () => {
    const { jon, gunna, bookingId } = await afterTheTrip();
    const written: string[] = [];
    for (let index = 0; index <= profileReviewsPageSize; index += 1) {
      const booking = index === 0 ? bookingId : await anotherBooking(bookingId, {});
      written.push(
        await storedReview({
          bookingId: booking,
          authorId: gunna.userId,
          subjectId: jon.userId,
          authorRole: "passenger",
          rating: 5,
          createdAt: at(api.now(), index),
        }),
      );
    }
    const first = await shownReviews(gunna, jon);
    expect(first.more).toBe(true);
    expect(first.reviews.map((one: ProfileReview) => one.id)).toEqual(
      written.toReversed().slice(0, profileReviewsPageSize),
    );
    const last = first.reviews.at(-1);
    const second = await shownReviews(gunna, jon, { before: last?.id });
    expect(second).toMatchObject({ more: false, reviews: [{ id: written[0] }] });
    const profileId = await profileIdOf(jon);
    expect((await reviewsOf(gunna, profileId, { before: crypto.randomUUID() })).status).toBe(404);
  });
});

describe("the reliability figure (spec 8, 3.8; R8.10)", () => {
  it("counts a completed booking for the passenger and the trip for its driver", async () => {
    const { jon, gunna } = await afterTheTrip();
    const counts = (kept: number, counted: number) => ({ kept, counted });
    expect((await shownProfile(gunna, jon)).reliability).toEqual({
      kept: 1,
      counted: 1,
      percent: null,
      byRole: { driver: counts(1, 1), passenger: counts(0, 0) },
    });
    expect((await shownProfile(jon, gunna)).reliability).toEqual({
      kept: 1,
      counted: 1,
      percent: null,
      byRole: { driver: counts(0, 0), passenger: counts(1, 1) },
    });
  });

  it("shows the share kept once 5 count, over the last 12 months, and only what counts", async () => {
    const { jon, gunna, bookingId } = await afterTheTrip();
    const now = api.now();
    // Four more completed rides, and one 13 months ago that no longer counts.
    for (let index = 0; index < 4; index += 1) {
      await anotherBooking(bookingId, { completedAt: at(now, -index * 24 * 60) });
    }
    await anotherBooking(bookingId, { completedAt: new Date(now.getTime() - 395 * dayMs) });
    // A late cancellation of hers that counts, and an early one that doesn't.
    const cancelled = {
      status: "cancelled",
      completedAt: null,
      cancelledAt: now,
      cancelledBy: "passenger",
      cancelReason: "plans_changed",
    } as const;
    await anotherBooking(bookingId, { ...cancelled, countsOnReliability: true });
    await anotherBooking(bookingId, { ...cancelled, countsOnReliability: false });
    // A no-show that stood, and one still open to an answer.
    const noShow = { status: "no_show", completedAt: null } as const;
    for (const outcome of ["stands", null]) {
      const id = await anotherBooking(bookingId, noShow);
      await api.connection.db.insert(disputes).values({
        bookingId: id,
        kind: "no_show",
        raisedAt: at(now, -60),
        ...(outcome === null ? {} : { outcome, decidedBy: "system", decidedAt: now }),
      });
    }
    // Jón left another passenger behind, as the operator found: it counts on him.
    await anotherBooking(bookingId, {
      status: "cancelled",
      completedAt: null,
      cancelledAt: now,
      cancelledBy: "driver",
      cancelReason: "driver_absent",
      countsOnReliability: true,
    });

    // 5 completed, 1 cancellation and 1 no-show: 5 kept of 7.
    expect((await shownProfile(jon, gunna)).reliability).toEqual({
      kept: 5,
      counted: 7,
      percent: 71,
      byRole: { driver: { kept: 0, counted: 0 }, passenger: { kept: 5, counted: 7 } },
    });
  });

  it("counts a driver's cancelled trip once, and never a trip without passengers", async () => {
    const { jon, gunna } = await afterTheTrip();
    const { db } = api.connection;
    const now = api.now();
    await db
      .update(trips)
      .set({
        driverId: jon.userId,
        status: "cancelled",
        cancelledAt: now,
        cancelReason: "car_problem",
        countsOnReliability: true,
      })
      .where(eq(trips.id, vik));
    await db
      .update(trips)
      .set({ driverId: jon.userId, status: "completed", completedAt: now })
      .where(eq(trips.id, north));
    // A trip cancelled for the weather doesn't count (R8.11).
    const [weather] = await db
      .select({ id: trips.id })
      .from(trips)
      .where(
        sql`${trips.id} not in (${airport}, ${vik}, ${north}) and ${trips.status} = 'published'`,
      )
      .limit(1);
    if (weather !== undefined) {
      await db
        .update(trips)
        .set({
          driverId: jon.userId,
          status: "cancelled",
          cancelledAt: now,
          cancelReason: "weather",
        })
        .where(eq(trips.id, weather.id));
    }
    expect((await shownProfile(gunna, jon)).reliability.byRole.driver).toEqual({
      kept: 1,
      counted: 2,
    });
  });
});
