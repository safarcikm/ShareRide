import type { MeetingPointSummary, MyTrip, TripCopy, TripDraftBody } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  checkTripForPublishing,
  dayPhase,
  err,
  firstTripChoices,
  isOfferedForNewTrips,
  lookUpLegs,
  noteMaxLength,
  ok,
  plannedTimes,
  reviewClosesAt,
  reviewsOpenSince,
  routeLegPairs,
  runsOrRan,
  stopsToCopy,
  takingsOf,
  type AccountSuspended,
  type DistancesMissing,
  type MeetingPointStatus,
  type PublishProblem,
  type Result,
  type TripChoices,
  type TripCancelReason,
  type TripDaySettings,
  type PriceSettings,
  type ReviewSettings,
} from "@shareride/domain";
import { and, asc, desc, eq, gt, inArray, isNull, lte, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { lockActive } from "../account/standing.ts";
import type { DrivingService } from "../driving/index.ts";
import { seatsTakenNow, takingsBookings } from "../bookings/seats.ts";
import { nameOf, toSummary } from "../meeting-points/service.ts";
import { shown } from "../privacy/hidden.ts";
import { checkInsAt, driverCheckedInAt, shownWindow } from "../trip-day/check-ins.ts";
import type { TripSettingsSource } from "../settings/trip-settings.ts";

const {
  bookings,
  disputes,
  legs,
  meetingPoints,
  reviews,
  segments,
  trips,
  tripStops,
  users,
  vehicles,
} = schema;

// The two ends of a request, for who asks first (spec 31, 3.3).
const askFromStops = alias(tripStops, "ask_from_stops");
const askToStops = alias(tripStops, "ask_to_stops");
const askFromPoints = alias(meetingPoints, "ask_from_points");
const askToPoints = alias(meetingPoints, "ask_to_points");

type TripRow = typeof trips.$inferSelect;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Queryable = Database | Transaction;

/** Something the driver sent that a draft cannot hold. */
export type DraftInvalid =
  | { readonly code: "stop_repeated"; readonly stop: number }
  | { readonly code: "stop_unavailable"; readonly stops: readonly number[] }
  | { readonly code: "planned_times_mismatch" }
  | { readonly code: "note_too_long" }
  | { readonly code: "vehicle_unavailable" };

export interface NotFound {
  readonly code: "not_found";
}

export interface NotDraft {
  readonly code: "trip_not_draft";
}

/** Fewer than two of a trip's meeting points are still in use (spec 6, 3.6). */
export interface TooFewStops {
  readonly code: "too_few_stops";
}

export interface NotPublishable {
  readonly code: "trip_not_publishable";
  readonly problems: readonly PublishProblem[];
}

/** The driver is deleting their account (spec 11, 3.4). */
export interface DeletionPending {
  readonly code: "account_deletion_pending";
}

/** A driver's drafts and publishing them (spec 3, 3.4 to 3.8, and section 4). */
export interface TripService {
  /**
   * Upcoming: drafts, most recently changed first, then published trips
   * whose last stop is still to come, soonest first. Past: published trips
   * whose last stop has passed, latest first.
   */
  myTrips(userId: string, when: "upcoming" | "past"): Promise<MyTrip[]>;
  myTrip(userId: string, tripId: string): Promise<MyTrip | undefined>;
  create(
    userId: string,
    body: TripDraftBody & { readonly stops: readonly string[] },
  ): Promise<Result<MyTrip, DraftInvalid | DistancesMissing>>;
  update(
    userId: string,
    tripId: string,
    body: TripDraftBody,
  ): Promise<Result<MyTrip, DraftInvalid | NotFound | NotDraft | DistancesMissing>>;
  remove(userId: string, tripId: string): Promise<Result<null, NotFound | NotDraft>>;
  publish(
    userId: string,
    tripId: string,
  ): Promise<
    Result<
      MyTrip,
      NotFound | NotDraft | NotPublishable | DistancesMissing | AccountSuspended | DeletionPending
    >
  >;
  /**
   * Post again, or the return (spec 6, 3.6): a new draft with the trip's
   * stops, reversed for the return, and its car while the driver still has
   * it, seats, price level, booking mode, preferences and note, without a
   * date. Stops the driver removed are left out, and so are meeting points
   * no longer offered for new trips, which the answer names.
   */
  copy(
    userId: string,
    tripId: string,
    options: { readonly reverse: boolean },
  ): Promise<Result<TripCopy, NotFound | TooFewStops>>;
}

/** Statuses of trips that hold the driver's time (R3.7). */
const ongoingStatuses = ["published", "departed"];
/** A trip past its last stop: completed 2 hours later (R8.1), or not yet. */
const endingStatuses = [...ongoingStatuses, "completed"];

/** A trip row's seats, price level, booking mode and preferences. */
export const choicesOf = (row: TripRow): TripChoices => ({
  seats: row.capacity,
  priceLevel: row.priceLevel,
  bookingMode: row.bookingMode as TripChoices["bookingMode"],
  preferences: {
    luggage: row.luggage as TripChoices["preferences"]["luggage"],
    pets: row.pets as TripChoices["preferences"]["pets"],
    smoking: row.smoking as TripChoices["preferences"]["smoking"],
    childSeat: row.childSeat,
    chat: row.chat as TripChoices["preferences"]["chat"],
  },
});

export function createTripService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  /** A draft is planned, and a trip published, by the values now. */
  readonly settings: TripSettingsSource;
  readonly tripDaySettings: TripDaySettings;
  /** For how long a ride that is done can still be rated (R8.8). */
  readonly reviewSettings: ReviewSettings;
  readonly driving: DrivingService;
}): TripService {
  const { db, clock, tripDaySettings, reviewSettings, driving } = dependencies;

  /** The legs for these ordered pairs, as a lookup. */
  async function legsFor(q: Queryable, pairs: readonly (readonly [string, string])[]) {
    const rows =
      pairs.length === 0
        ? []
        : await q
            .select()
            .from(legs)
            .where(
              sql`(${legs.fromMeetingPointId}, ${legs.toMeetingPointId}) in (${sql.join(
                pairs.map(([from, to]) => sql`(${from}::uuid, ${to}::uuid)`),
                sql`, `,
              )})`,
            );
    return lookUpLegs(
      rows.map((row) => ({
        from: row.fromMeetingPointId,
        to: row.toMeetingPointId,
        distanceM: row.distanceM,
        durationS: row.durationS,
      })),
    );
  }

  /** The trips as the driver sees them, in the order given. */
  async function present(q: Queryable, rows: readonly TripRow[]): Promise<MyTrip[]> {
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return [];
    const now = clock();
    // A booking completes with its trip, so only a trip that is done has
    // anyone to rate: a draft that is saved, or a list of rides to come,
    // does not ask.
    const done = rows.filter((row) => row.status === "completed").map((row) => row.id);
    const [stopRows, segmentRows, askRows, rateRows, occupancy, takings] = await Promise.all([
      q
        .select({ stop: tripStops, point: meetingPoints })
        .from(tripStops)
        .innerJoin(meetingPoints, eq(meetingPoints.id, tripStops.meetingPointId))
        // A stop removed from a published trip is not one (spec 6, 3.2).
        .where(and(inArray(tripStops.tripId, ids), isNull(tripStops.removedAt)))
        .orderBy(asc(tripStops.position)),
      q
        .select()
        .from(segments)
        .where(inArray(segments.tripId, ids))
        .orderBy(asc(segments.position)),
      // Of each trip's requests that wait: how many there are, and the one
      // that closes first, the earlier sent of two that close together
      // (spec 31, 3.3). One statement, so the three never disagree.
      q
        .selectDistinctOn([bookings.tripId], {
          tripId: bookings.tripId,
          count: sql<number>`count(*) over (partition by ${bookings.tripId})`.mapWith(Number),
          closesAt: bookings.expiresAt,
          firstName: users.firstName,
          seats: bookings.seats,
          fromIs: askFromPoints.nameIs,
          fromEn: askFromPoints.nameEn,
          toIs: askToPoints.nameIs,
          toEn: askToPoints.nameEn,
        })
        .from(bookings)
        .innerJoin(users, eq(users.id, bookings.passengerId))
        .innerJoin(askFromStops, eq(askFromStops.id, bookings.fromStopId))
        .innerJoin(askFromPoints, eq(askFromPoints.id, askFromStops.meetingPointId))
        .innerJoin(askToStops, eq(askToStops.id, bookings.toStopId))
        .innerJoin(askToPoints, eq(askToPoints.id, askToStops.meetingPointId))
        .where(
          and(
            inArray(bookings.tripId, ids),
            eq(bookings.status, "requested"),
            // A request whose deadline passed reads as expired, as bookings show it.
            gt(bookings.expiresAt, now),
          ),
        )
        .orderBy(
          asc(bookings.tripId),
          asc(bookings.expiresAt),
          asc(bookings.createdAt),
          asc(bookings.id),
        ),
      // The completed bookings whose passenger the driver can still rate
      // (spec 31, 3.10), in the order they were made, as the review
      // service would take a review of each now: within its days, not yet
      // reviewed by the driver, no report waiting to be decided, and a
      // passenger who has not left.
      done.length === 0
        ? []
        : q
            .select({
              tripId: bookings.tripId,
              bookingId: bookings.id,
              completedAt: bookings.completedAt,
            })
            .from(bookings)
            .innerJoin(users, eq(users.id, bookings.passengerId))
            .where(
              and(
                inArray(bookings.tripId, done),
                eq(bookings.status, "completed"),
                gt(bookings.completedAt, reviewsOpenSince(now, reviewSettings)),
                shown(users),
                notExists(
                  q
                    .select({ id: reviews.id })
                    .from(reviews)
                    .where(
                      and(eq(reviews.bookingId, bookings.id), eq(reviews.authorRole, "driver")),
                    ),
                ),
                notExists(
                  q
                    .select({ id: disputes.id })
                    .from(disputes)
                    .where(and(eq(disputes.bookingId, bookings.id), isNull(disputes.outcome))),
                ),
              ),
            )
            .orderBy(asc(bookings.createdAt), asc(bookings.id)),
      seatsTakenNow(q, ids, now),
      takingsBookings(q, ids, now),
    ]);
    const checkIns = await checkInsAt(
      q,
      stopRows.map(({ stop }) => stop.id),
    );
    // A draft is priced by the values now; a trip that was published by
    // the price values of its version (spec 10, R10.3).
    const priceValues = ({
      suggestedRatePerKm,
      referenceCostPerKm,
      priceStep,
      priceLevelStep,
    }: PriceSettings) => ({ suggestedRatePerKm, referenceCostPerKm, priceStep, priceLevelStep });
    const current = priceValues((await dependencies.settings.current()).settings);
    const published = new Map<number, PriceSettings>();
    for (const row of rows) {
      if (row.status !== "draft" && !published.has(row.settingsVersion)) {
        published.set(
          row.settingsVersion,
          priceValues(await dependencies.settings.at(row.settingsVersion)),
        );
      }
    }
    return rows.map((row) => {
      // The trip day is for a trip that runs, or ran (spec 8, 3.1).
      const runs = runsOrRan(row.status as MyTrip["status"]);
      const ask = askRows.find((request) => request.tripId === row.id);
      const rate = rateRows.flatMap(({ tripId, bookingId, completedAt }) =>
        tripId === row.id && completedAt !== null ? [{ bookingId, completedAt }] : [],
      );
      return {
        id: row.id,
        status: row.status as MyTrip["status"],
        stops: stopRows
          .filter(({ stop }) => stop.tripId === row.id)
          // A point retired meanwhile leaves a draft (spec 3, 3.9).
          .filter(({ point }) => row.status !== "draft" || isListed(point.status))
          .map(({ stop, point }) => ({
            id: stop.id,
            meetingPoint: toSummary(point),
            plannedAt: stop.plannedAt?.toISOString() ?? null,
            checkIn:
              runs && stop.plannedAt !== null
                ? {
                    ...shownWindow(stop.plannedAt, tripDaySettings),
                    at: driverCheckedInAt(checkIns, stop.id)?.toISOString() ?? null,
                  }
                : null,
          })),
        phase:
          runs && row.departsAt !== null && row.arrivesAt !== null
            ? dayPhase(row.departsAt, row.arrivesAt, now, tripDaySettings)
            : null,
        ...choicesOf(row),
        vehicleId: row.vehicleId,
        note: row.note,
        departsAt: row.departsAt?.toISOString() ?? null,
        arrivesAt: row.arrivesAt?.toISOString() ?? null,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
        segments: segmentRows
          .filter((segment) => segment.tripId === row.id)
          .map((segment) => ({
            distanceM: segment.distanceM,
            durationS: segment.durationS,
            suggestedPrice: { amount: segment.suggestedPrice, currency: "ISK" as const },
            cap: { amount: segment.cap, currency: "ISK" as const },
            price: { amount: segment.price, currency: "ISK" as const },
            seatsTaken: occupancy(row.id, segment.position, segment.occupancy),
          })),
        takings: takingsOf(takings.get(row.id) ?? []),
        priceSettings:
          row.status === "draft" ? current : (published.get(row.settingsVersion) ?? current),
        openRequests: ask?.count ?? 0,
        requestsCloseAt: ask?.closesAt?.toISOString() ?? null,
        firstRequest:
          ask === undefined
            ? null
            : {
                firstName: ask.firstName,
                seats: ask.seats,
                from: nameOf({ nameIs: ask.fromIs, nameEn: ask.fromEn }),
                to: nameOf({ nameIs: ask.toIs, nameEn: ask.toEn }),
              },
        toRate:
          rate.length === 0
            ? null
            : {
                bookingIds: rate.map(({ bookingId }) => bookingId),
                // When the last of their times to review ends.
                closesAt: reviewClosesAt(
                  new Date(Math.max(...rate.map(({ completedAt }) => completedAt.getTime()))),
                  reviewSettings,
                ).toISOString(),
              },
        cancellation:
          row.status === "cancelled" && row.cancelReason !== null
            ? {
                reason: row.cancelReason as TripCancelReason,
                note: row.cancelNote,
                countsOnReliability: row.countsOnReliability,
              }
            : null,
      };
    });
  }

  async function presentOne(q: Queryable, row: TripRow): Promise<MyTrip> {
    const [trip] = await present(q, [row]);
    if (trip === undefined) throw new Error("The trip was not presented.");
    return trip;
  }

  /** My trip, locked for the rest of the transaction. */
  async function mine(tx: Transaction, userId: string, tripId: string) {
    const [row] = await tx
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.driverId, userId)))
      .for("update");
    return row;
  }

  /** Each stop once, and each offered for new trips. */
  async function checkStops(
    q: Queryable,
    stops: readonly string[],
  ): Promise<Result<null, DraftInvalid>> {
    const repeated = stops.findIndex((stop, index) => stops.indexOf(stop) !== index);
    if (repeated !== -1) return err({ code: "stop_repeated", stop: repeated });
    const rows = await q
      .select({ id: meetingPoints.id, status: meetingPoints.status })
      .from(meetingPoints)
      .where(inArray(meetingPoints.id, [...stops]));
    const offered = new Set(
      rows
        .filter((row) => isOfferedForNewTrips(row.status as MeetingPointStatus))
        .map((row) => row.id),
    );
    const unavailable = stops.flatMap((stop, index) => (offered.has(stop) ? [] : [index]));
    return unavailable.length > 0
      ? err({ code: "stop_unavailable", stops: unavailable })
      : ok(null);
  }

  /** Planned times from the departure and the typical times of the stretches. */
  async function timesFrom(
    q: Queryable,
    stops: readonly string[],
    departure: Date,
  ): Promise<Result<Date[], DistancesMissing>> {
    const stretches = stops.slice(1).map((to, index) => [stops[index] ?? "", to] as const);
    const lookup = await legsFor(q, stretches);
    const typicalS: number[] = [];
    const missing: (readonly [string, string])[] = [];
    for (const [from, to] of stretches) {
      const leg = lookup(from, to);
      if (leg === undefined) missing.push([from, to]);
      else typicalS.push(leg.durationS);
    }
    if (missing.length > 0) return err({ code: "distances_missing", pairs: missing });
    const { settings } = await dependencies.settings.current();
    return ok(plannedTimes(departure, typicalS, settings));
  }

  async function myCar(q: Queryable, userId: string, vehicleId: string): Promise<boolean> {
    const [car] = await q
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(
        and(eq(vehicles.id, vehicleId), eq(vehicles.ownerId, userId), isNull(vehicles.removedAt)),
      );
    return car !== undefined;
  }

  /** The stops and times a change leaves the draft with, or why it cannot. */
  async function stopsAndTimes(
    q: Queryable,
    body: TripDraftBody,
    current: { readonly stops: readonly string[]; readonly times: readonly Date[] | null },
  ): Promise<
    Result<
      { stops: readonly string[]; times: readonly Date[] | null } | null,
      DraftInvalid | DistancesMissing
    >
  > {
    const stops = body.stops ?? current.stops;
    if (body.stops !== undefined) {
      const checked = await checkStops(q, stops);
      if (!checked.ok) return checked;
    }
    if (body.plannedTimes !== undefined) {
      if (body.plannedTimes.length !== stops.length) return err({ code: "planned_times_mismatch" });
      return ok({ stops, times: body.plannedTimes.map((time) => new Date(time)) });
    }
    if (body.departure === undefined && body.stops === undefined) return ok(null);
    // New stops keep the departure; their times start again from the typical times.
    let departure = current.times?.[0] ?? null;
    if (body.departure !== undefined) {
      departure = body.departure === null ? null : new Date(body.departure);
    }
    if (departure === null) return ok({ stops, times: null });
    const times = await timesFrom(q, stops, departure);
    return times.ok ? ok({ stops, times: times.value }) : times;
  }

  async function writeStops(
    tx: Transaction,
    tripId: string,
    stops: readonly string[],
    times: readonly Date[] | null,
  ) {
    await tx.delete(tripStops).where(eq(tripStops.tripId, tripId));
    await tx.insert(tripStops).values(
      stops.map((meetingPointId, position) => ({
        tripId,
        meetingPointId,
        position,
        plannedAt: times?.[position] ?? null,
      })),
    );
  }

  /**
   * Takes stops whose point was retired, or put back in preparation, off a
   * draft (spec 3, 3.9), and keeps its departure and arrival those of the
   * stops left. Paused points stay: a pause is short, and publishing names
   * the stop. Answers whether any stop went.
   */
  async function dropUnlistedStops(tx: Transaction, tripId: string): Promise<boolean> {
    const unlisted = await tx
      .select({ id: tripStops.id })
      .from(tripStops)
      .innerJoin(meetingPoints, eq(meetingPoints.id, tripStops.meetingPointId))
      .where(
        and(eq(tripStops.tripId, tripId), inArray(meetingPoints.status, ["draft", "retired"])),
      );
    if (unlisted.length === 0) return false;
    await tx.delete(tripStops).where(
      inArray(
        tripStops.id,
        unlisted.map((stop) => stop.id),
      ),
    );
    const left = await tx
      .select({ id: tripStops.id, plannedAt: tripStops.plannedAt })
      .from(tripStops)
      .where(eq(tripStops.tripId, tripId))
      .orderBy(asc(tripStops.position));
    // Positions stay contiguous from 0 (invariant 1). Each stop moves to a
    // place freed before it, so the order never clashes.
    for (const [position, stop] of left.entries()) {
      await tx.update(tripStops).set({ position }).where(eq(tripStops.id, stop.id));
    }
    const times = left.map((stop) => stop.plannedAt);
    const planned = left.length > 0 && times.every((time) => time !== null);
    await tx
      .update(trips)
      .set({
        departsAt: planned ? times[0] : null,
        arrivesAt: planned ? times.at(-1) : null,
      })
      .where(eq(trips.id, tripId));
    return true;
  }

  const noteOf = (note: string | undefined) => note?.normalize("NFC");
  const noteTooLong = (note: string | undefined) =>
    note !== undefined && Array.from(note).length > noteMaxLength;

  const service: TripService = {
    async myTrips(userId, when) {
      const now = clock();
      // A published trip is past once its last stop is, as a booking is past
      // once its passenger is out (spec 16, section 6), whether it has
      // departed or completed yet (spec 8, R8.1); a cancelled one at once
      // (spec 6, 3.1).
      const rows =
        when === "upcoming"
          ? await db
              .select()
              .from(trips)
              .where(
                and(
                  eq(trips.driverId, userId),
                  or(
                    eq(trips.status, "draft"),
                    and(inArray(trips.status, ongoingStatuses), gt(trips.arrivesAt, now)),
                  ),
                ),
              )
              .orderBy(
                sql`${trips.status} <> 'draft'`,
                sql`case when ${trips.status} = 'draft' then ${trips.updatedAt} end desc`,
                asc(trips.departsAt),
                asc(trips.id),
              )
          : await db
              .select()
              .from(trips)
              .where(
                and(
                  eq(trips.driverId, userId),
                  or(
                    and(inArray(trips.status, endingStatuses), lte(trips.arrivesAt, now)),
                    eq(trips.status, "cancelled"),
                  ),
                ),
              )
              .orderBy(desc(trips.departsAt), asc(trips.id));
      return present(db, rows);
    },

    async myTrip(userId, tripId) {
      const [row] = await db
        .select()
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.driverId, userId)));
      return row === undefined ? undefined : presentOne(db, row);
    },

    async create(userId, body) {
      const note = noteOf(body.note);
      if (noteTooLong(note)) return err({ code: "note_too_long" });
      if (body.vehicleId !== undefined && body.vehicleId !== null) {
        if (!(await myCar(db, userId, body.vehicleId))) return err({ code: "vehicle_unavailable" });
      }
      // The stops are always given here, so they are always checked.
      const route = await stopsAndTimes(db, body, { stops: body.stops, times: null });
      if (!route.ok) return route;
      const { stops, times } = route.value ?? { stops: body.stops, times: null };

      // A new draft starts from the driver's previous trip (spec 3, 3.6.3, 3.7).
      const [previous] = await db
        .select()
        .from(trips)
        .where(and(eq(trips.driverId, userId), ne(trips.status, "draft")))
        .orderBy(desc(trips.publishedAt))
        .limit(1);
      const choices = previous === undefined ? firstTripChoices : choicesOf(previous);
      let vehicleId = body.vehicleId;
      if (vehicleId === undefined) {
        const cars = await driving.vehicles(userId);
        const previousCar = cars.find((car) => car.id === previous?.vehicleId);
        vehicleId = (previousCar ?? cars[0])?.id ?? null;
      }

      const now = clock();
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(trips)
          .values({
            createdAt: now,
            updatedAt: now,
            driverId: userId,
            vehicleId,
            capacity: body.seats ?? choices.seats,
            priceLevel: body.priceLevel ?? choices.priceLevel,
            bookingMode: body.bookingMode ?? choices.bookingMode,
            ...(body.preferences ?? choices.preferences),
            note: note ?? "",
            departsAt: times?.[0] ?? null,
            arrivesAt: times?.at(-1) ?? null,
          })
          .returning();
        if (row === undefined) throw new Error("The draft was not stored.");
        await writeStops(tx, row.id, stops, times);
        return ok(await presentOne(tx, row));
      });
    },

    async update(userId, tripId, body) {
      const note = noteOf(body.note);
      if (noteTooLong(note)) return err({ code: "note_too_long" });
      return db.transaction(async (tx) => {
        const row = await mine(tx, userId, tripId);
        if (row === undefined || row.status === "cancelled") return err({ code: "not_found" });
        if (row.status !== "draft") return err({ code: "trip_not_draft" });
        if (body.vehicleId !== undefined && body.vehicleId !== null) {
          if (!(await myCar(tx, userId, body.vehicleId)))
            return err({ code: "vehicle_unavailable" });
        }
        await dropUnlistedStops(tx, tripId);
        const current = await tx
          .select()
          .from(tripStops)
          .where(eq(tripStops.tripId, tripId))
          .orderBy(asc(tripStops.position));
        const currentTimes = current.map((stop) => stop.plannedAt);
        const route = await stopsAndTimes(tx, body, {
          stops: current.map((stop) => stop.meetingPointId),
          times: currentTimes.every((time) => time !== null) ? currentTimes : null,
        });
        if (!route.ok) return route;

        const [updated] = await tx
          .update(trips)
          .set({
            ...(body.vehicleId === undefined ? {} : { vehicleId: body.vehicleId }),
            ...(body.seats === undefined ? {} : { capacity: body.seats }),
            ...(body.priceLevel === undefined ? {} : { priceLevel: body.priceLevel }),
            ...(body.bookingMode === undefined ? {} : { bookingMode: body.bookingMode }),
            ...(body.preferences ?? {}),
            ...(note === undefined ? {} : { note }),
            ...(route.value === null
              ? {}
              : {
                  departsAt: route.value.times?.[0] ?? null,
                  arrivesAt: route.value.times?.at(-1) ?? null,
                }),
            updatedAt: clock(),
          })
          .where(eq(trips.id, tripId))
          .returning();
        if (updated === undefined) throw new Error("The draft was not stored.");
        if (route.value !== null) {
          await writeStops(tx, tripId, route.value.stops, route.value.times);
        }
        return ok(await presentOne(tx, updated));
      });
    },

    async remove(userId, tripId) {
      return db.transaction(async (tx) => {
        const row = await mine(tx, userId, tripId);
        if (row === undefined || row.status === "cancelled") return err({ code: "not_found" });
        if (row.status !== "draft") return err({ code: "trip_not_draft" });
        await tx.delete(trips).where(eq(trips.id, tripId));
        return ok(null);
      });
    },

    async publish(userId, tripId) {
      const readiness = await driving.readiness(userId);
      // The values and their version together, so the trip records the
      // version its prices were worked out with (spec 10, R10.3).
      const { version: settingsVersion, settings } = await dependencies.settings.current();
      return db.transaction(async (tx) => {
        // One publish at a time per driver, so two cannot overlap (R3.7);
        // none while suspended (spec 9, 3.6.2). Deleting an account takes
        // the same lock before it checks.
        const active = await lockActive(tx, userId, clock());
        if (!active.ok) return active;
        const [driver] = await tx
          .select({ deleteAfter: users.deleteAfter })
          .from(users)
          .where(eq(users.id, userId));
        if (driver === undefined || driver.deleteAfter !== null) {
          return err({ code: "account_deletion_pending" });
        }
        const row = await mine(tx, userId, tripId);
        if (row === undefined || row.status === "cancelled") return err({ code: "not_found" });
        if (row.status !== "draft") return err({ code: "trip_not_draft" });
        await dropUnlistedStops(tx, tripId);

        // The points are read shared: a pause or a retirement under way
        // waits for the publish and then counts this trip among those to
        // tell, or the publish waits for it and sees the point not offered.
        const stopRows = await tx
          .select({ stop: tripStops, point: meetingPoints })
          .from(tripStops)
          .innerJoin(meetingPoints, eq(meetingPoints.id, tripStops.meetingPointId))
          .where(eq(tripStops.tripId, tripId))
          .orderBy(asc(tripStops.position))
          .for("share", { of: meetingPoints });
        const ids = stopRows.map(({ stop }) => stop.meetingPointId);
        const times = stopRows.map(({ stop }) => stop.plannedAt);
        const others = await tx
          .select({ departsAt: trips.departsAt, arrivesAt: trips.arrivesAt })
          .from(trips)
          .where(
            and(
              eq(trips.driverId, userId),
              inArray(trips.status, ongoingStatuses),
              ne(trips.id, tripId),
            ),
          );
        const hasCar = row.vehicleId !== null && (await myCar(tx, userId, row.vehicleId));

        const checked = checkTripForPublishing(
          {
            stops: stopRows.map(({ point }) => ({
              id: point.id,
              offered: isOfferedForNewTrips(point.status as MeetingPointStatus),
              season: point,
            })),
            plannedTimes: times.every((time) => time !== null) ? times : null,
            seats: row.capacity,
            priceLevel: row.priceLevel,
            note: row.note,
            hasCar,
            driverReady: readiness.ready,
            otherTrips: others.flatMap(({ departsAt, arrivesAt }) =>
              departsAt === null || arrivesAt === null ? [] : [{ departsAt, arrivesAt }],
            ),
          },
          await legsFor(tx, routeLegPairs(ids)),
          clock(),
          settings,
        );
        if (!checked.ok) return checked;
        const { problems, departsAt, arrivesAt } = checked.value;
        if (problems.length > 0 || departsAt === null || arrivesAt === null) {
          return err({ code: "trip_not_publishable", problems });
        }

        await tx.insert(segments).values(
          checked.value.segments.map((segment, position) => ({
            tripId,
            position,
            fromStopId: stopRows[position]?.stop.id ?? "",
            toStopId: stopRows[position + 1]?.stop.id ?? "",
            distanceM: segment.distanceM,
            durationS: segment.durationS,
            suggestedPrice: segment.suggestedPrice.amount,
            cap: segment.cap.amount,
            price: segment.price.amount,
            capacity: row.capacity,
          })),
        );
        const now = clock();
        const [published] = await tx
          .update(trips)
          .set({
            status: "published",
            publishedAt: now,
            settingsVersion,
            departsAt,
            arrivesAt,
            updatedAt: now,
          })
          .where(eq(trips.id, tripId))
          .returning();
        if (published === undefined) throw new Error("The trip was not published.");
        return ok(await presentOne(tx, published));
      });
    },

    async copy(userId, tripId, { reverse }) {
      const [row] = await db
        .select()
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.driverId, userId)));
      if (row === undefined) return err({ code: "not_found" });
      const stops = await db
        .select({ point: meetingPoints })
        .from(tripStops)
        .innerJoin(meetingPoints, eq(meetingPoints.id, tripStops.meetingPointId))
        .where(and(eq(tripStops.tripId, tripId), isNull(tripStops.removedAt)))
        .orderBy(asc(tripStops.position));
      const copied = stopsToCopy(
        stops.map(({ point }) => ({
          meetingPointId: point.id,
          offered: isOfferedForNewTrips(point.status as MeetingPointStatus),
        })),
        { reverse },
      );
      if (copied.stops.length < 2) return err({ code: "too_few_stops" });
      const carStays = row.vehicleId !== null && (await myCar(db, userId, row.vehicleId));
      const { seats, priceLevel, bookingMode, preferences } = choicesOf(row);
      const created = await service.create(userId, {
        stops: copied.stops,
        seats,
        priceLevel,
        bookingMode,
        preferences,
        // A note ShareRide hid stays behind: the driver writes a new one (spec 9, 3.4.3).
        note: row.noteHiddenAt === null ? row.note : "",
        // A car removed since: the driver's other car, as for a new draft.
        ...(carStays ? { vehicleId: row.vehicleId } : {}),
      });
      // Every stop is offered, the car the driver's and the note as published.
      if (!created.ok) throw new Error(`A trip's copy was refused: ${created.error.code}.`);
      const dropped: MeetingPointSummary[] = copied.dropped.map((pointId) => {
        const found = stops.find(({ point }) => point.id === pointId);
        if (found === undefined) throw new Error("A dropped stop is not on the trip.");
        return toSummary(found.point);
      });
      return ok({ trip: created.value, dropped });
    },
  };
  return service;
}

/** Points a trip may show: not drafts the operator is still preparing, nor retired ones. */
function isListed(status: string): boolean {
  return status !== "draft" && status !== "retired";
}
