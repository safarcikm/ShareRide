// Helpers for the integration tests of bookings: members, sample trips'
// details, and booking what they show. Tests only.
import { randomUUID } from "node:crypto";
import {
  bookTripRoute,
  refreshRoute,
  tripDetailsRoute,
  type BookTripBody,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { holdsSeats, statusAt, type BookingStatus } from "@shareride/domain";
import { sampleId, seedSampleMeetingPoints, seedSampleTrips } from "@shareride/db/seed";
import { eq, sql } from "drizzle-orm";
import type { TestApi } from "../../testing.ts";

/** The sample trips (packages/db/src/sample/trips.ts). */
export const sampleTrip = {
  north: sampleId("trip:anna-akureyri"),
  airport: sampleId("trip:jon-airport"),
  vik: sampleId("trip:jon-vik"),
};

export const hours = (count: number) => count * 3600;

export type Member = Awaited<ReturnType<TestApi["signIn"]>>;

/** The sample meeting points, once per test file. */
export async function seedForBookings(api: TestApi): Promise<void> {
  await seedSampleMeetingPoints(api.connection.db, api.now());
}

/** The sample trips again, with no bookings on them. */
export async function freshSampleTrips(api: TestApi): Promise<void> {
  await api.connection.db.execute(sql`delete from booking_segment_prices`);
  await api.connection.db.execute(sql`delete from bookings`);
  await seedSampleTrips(api.connection.db, api.now());
}

/**
 * Helpers bound to the test API that `apiOf` gives once it has started.
 * Tests that move the clock with `later` call `rewind` after each test.
 */
export function bookingHelpers(apiOf: () => TestApi) {
  let moved = 0;

  /** A member who has verified their number, confirmed their age and accepted the terms. */
  async function newMember(firstName: string, { complete = true } = {}) {
    const api = apiOf();
    const signedIn = await api.signIn(api.newPhoneNumber());
    if (!complete) return signedIn;
    const { db } = api.connection;
    await db
      .update(schema.users)
      .set({ firstName, ageConfirmedAt: api.now() })
      .where(eq(schema.users.id, signedIn.userId));
    const documents = await db.select().from(schema.legalDocuments);
    await db.insert(schema.legalAcceptances).values(
      documents.map((document) => ({
        userId: signedIn.userId,
        documentId: document.id,
        version: document.version,
        locale: "en",
        acceptedAt: api.now(),
      })),
    );
    return signedIn;
  }

  /**
   * Moves the clock on and gives each member a new access token, as the app
   * would get one; the old ones have expired by then.
   */
  async function later(seconds: number, ...members: Member[]) {
    const api = apiOf();
    api.advance(seconds);
    moved += seconds;
    for (const member of members) {
      const result = await api.client.call(refreshRoute, {
        body: { refreshToken: member.refreshToken },
      });
      if (!result.ok) throw new Error(result.error.code);
      member.accessToken = result.data.accessToken;
      member.refreshToken = result.data.refreshToken ?? "";
    }
  }

  /** Moves the clock back by what `later` moved it, even after a failed test. */
  function rewind() {
    apiOf().advance(-moved);
    moved = 0;
  }

  /** Makes `member` the driver of a sample trip, so they can answer its requests. */
  async function driverOf(tripId: string, firstName = "Anna") {
    const member = await newMember(firstName);
    await apiOf()
      .connection.db.update(schema.trips)
      .set({ driverId: member.userId })
      .where(eq(schema.trips.id, tripId));
    return member;
  }

  async function details(
    id: string,
    fromStop?: number,
    toStop?: number,
    seats = 1,
    token?: string,
  ) {
    const found = await apiOf().client.call(tripDetailsRoute, {
      params: { id },
      query: {
        ...(fromStop === undefined ? {} : { fromStop }),
        ...(toStop === undefined ? {} : { toStop }),
        seats,
      },
      ...(token === undefined ? {} : { accessToken: token }),
    });
    if (!found.ok) throw new Error(found.error.code);
    return found.data;
  }

  /** Books or requests what trip details show for the part, unless told otherwise. */
  async function book(
    accessToken: string,
    tripId: string,
    part: Partial<BookTripBody> & { readonly fromStop: number; readonly toStop: number },
  ) {
    const seats = part.seats ?? 1;
    const shown = await details(tripId, part.fromStop, part.toStop, seats);
    return apiOf().client.call(bookTripRoute, {
      accessToken,
      params: { id: tripId },
      body: {
        seats,
        total: shown.part.total,
        message: "",
        attemptKey: randomUUID(),
        ...part,
      },
    });
  }

  async function booked(accessToken: string, tripId: string, part: Parameters<typeof book>[2]) {
    const result = await book(accessToken, tripId, part);
    if (!result.ok) throw new Error(`${String(result.status)} ${result.error.code}`);
    return result.data;
  }

  /** The seats held on each segment, as stored. */
  async function occupancy(tripId: string) {
    const rows = await apiOf()
      .connection.db.select({ occupancy: schema.segments.occupancy })
      .from(schema.segments)
      .where(eq(schema.segments.tripId, tripId))
      .orderBy(schema.segments.position);
    return rows.map((row) => row.occupancy);
  }

  /**
   * The seats on each segment of the bookings that hold seats (rule S1):
   * by their stored status, or by their status as of `asOf`.
   */
  async function heldByBookings(tripId: string, asOf?: Date) {
    const { db } = apiOf().connection;
    const stops = await db
      .select({ id: schema.tripStops.id, position: schema.tripStops.position })
      .from(schema.tripStops)
      .where(eq(schema.tripStops.tripId, tripId));
    const position = (id: string) => stops.find((stop) => stop.id === id)?.position ?? -1;
    const rows = await db.select().from(schema.bookings).where(eq(schema.bookings.tripId, tripId));
    const held = (await occupancy(tripId)).map(() => 0);
    for (const row of rows) {
      const status =
        asOf === undefined
          ? (row.status as BookingStatus)
          : statusAt(
              {
                status: row.status as BookingStatus,
                requestExpiresAt: row.expiresAt,
                paymentDueAt: row.paymentDueAt,
              },
              asOf,
            );
      if (!holdsSeats(status)) continue;
      for (let at = position(row.fromStopId); at < position(row.toStopId); at++) {
        held[at] = (held[at] ?? 0) + row.seats;
      }
    }
    return held;
  }

  return {
    newMember,
    later,
    rewind,
    driverOf,
    details,
    book,
    booked,
    occupancy,
    heldByBookings,
  };
}
