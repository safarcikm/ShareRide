import { schema, type Database } from "@shareride/db";
import { privacyCutoffs } from "@shareride/domain";
import {
  and,
  asc,
  count,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Logger } from "../../logger.ts";
import type { Transaction } from "../bookings/seats.ts";
import { catalogued, emptiedOf, freshIdsOf, tableOf } from "./catalogue.ts";
import { tripNotHeld } from "./holds.ts";

const {
  bookings,
  checkIns,
  disputes,
  formerMemberId,
  reviews,
  tripChanges,
  tripStops,
  trips,
  users,
  vehicles,
} = schema;

type Executor = Database | Transaction;

// Trips and bookings 3 years after the trip (spec 11, 3.7; plan 4.7; the
// privacy register): kept for the other side and the accounts, but no
// longer about anyone. As an erasure does, each record of the trip moves
// to the former member with its free text emptied, as the personal data
// catalogue says; the car becomes one of the same make, model and colour
// with no plate. Stops, prices and payments stay as they are. A trip waits
// while a hold covers it, a booking on it, its driver or a passenger.
// Its reviews stay for the people they are about, with their stars,
// comment and dates, but no longer say who wrote them or on which ride
// (A49): they move to the former member, on no booking.

/** How each table of a trip's records reaches the trip. */
const reaches: Readonly<Record<string, (tripId: string, db: Executor) => SQL>> = {
  trips: (tripId) => eq(trips.id, tripId),
  bookings: (tripId) => eq(bookings.tripId, tripId),
  check_ins: (tripId, db) =>
    inArray(
      checkIns.tripStopId,
      db.select({ id: tripStops.id }).from(tripStops).where(eq(tripStops.tripId, tripId)),
    ),
  disputes: (tripId, db) =>
    inArray(
      disputes.bookingId,
      db.select({ id: bookings.id }).from(bookings).where(eq(bookings.tripId, tripId)),
    ),
};

interface TripRecords {
  readonly table: PgTable;
  readonly people: readonly string[];
  readonly emptied: readonly string[];
  readonly otherIds: readonly string[];
  readonly column: (key: string) => PgColumn;
  readonly reach: (tripId: string, db: Executor) => SQL;
}

/**
 * The catalogue's trip and booking tables that name a person or keep free
 * text. One this rule cannot reach fails the rule, so a new one is never
 * left behind.
 */
function tripRecords(): readonly TripRecords[] {
  return catalogued().flatMap(({ name, entry, deletion, column }) => {
    if (entry.category !== "trips_and_bookings") return [];
    const emptied = deletion.rows === "keep" ? deletion.emptied : [];
    if (entry.personColumns.length === 0 && emptied.length === 0) return [];
    const reach = reaches[name];
    if (reach === undefined) throw new Error(`The trips rule does not reach ${name}.`);
    return [
      {
        table: tableOf(name),
        people: entry.personColumns,
        emptied,
        otherIds: entry.otherIds ?? [],
        column,
        reach,
      },
    ];
  });
}

/** The reviews of the bookings on a trip: `tripId`, or the trip a query is at. */
function reviewsOn(tripId: string | PgColumn, db: Executor): SQL {
  return inArray(
    reviews.bookingId,
    db.select({ id: bookings.id }).from(bookings).where(eq(bookings.tripId, tripId)),
  );
}

/**
 * A trip someone is still named on: as driver, passenger, "I'm here", by
 * their car, or by a review of one of its bookings.
 */
function stillNamed(db: Executor): SQL {
  return or(
    ne(trips.driverId, formerMemberId),
    exists(
      db
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.tripId, trips.id), ne(bookings.passengerId, formerMemberId))),
    ),
    exists(
      db
        .select({ id: checkIns.id })
        .from(checkIns)
        .innerJoin(tripStops, eq(tripStops.id, checkIns.tripStopId))
        .where(and(eq(tripStops.tripId, trips.id), ne(checkIns.userId, formerMemberId))),
    ),
    exists(
      db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(and(eq(vehicles.id, trips.vehicleId), ne(vehicles.ownerId, formerMemberId))),
    ),
    exists(db.select({ id: reviews.id }).from(reviews).where(reviewsOn(trips.id, db))),
  ) as SQL;
}

/** A former member's car that looks like this one, with no plate: an old one, or a new one. */
async function formerMembersCar(tx: Transaction, carId: string, now: Date): Promise<string> {
  const [car] = await tx
    .select({
      ownerId: vehicles.ownerId,
      make: vehicles.make,
      model: vehicles.model,
      colour: vehicles.colour,
    })
    .from(vehicles)
    .where(eq(vehicles.id, carId));
  if (car === undefined || car.ownerId === formerMemberId) return carId;
  const look = and(
    eq(vehicles.ownerId, formerMemberId),
    eq(vehicles.make, car.make),
    eq(vehicles.model, car.model),
    eq(vehicles.colour, car.colour),
    isNull(vehicles.registration),
  );
  const [same] = await tx
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(look)
    .orderBy(asc(vehicles.id))
    .limit(1);
  if (same !== undefined) return same.id;
  const [made] = await tx
    .insert(vehicles)
    .values({
      ownerId: formerMemberId,
      make: car.make,
      model: car.model,
      colour: car.colour,
      registration: null,
      // Nobody drives it: it stands for the cars of old trips.
      removedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: vehicles.id });
  if (made === undefined) throw new Error("The car was not saved.");
  return made.id;
}

export interface OldTripCounts {
  /** Trips made anonymous. */
  readonly trips: number;
  /** Bookings on them that still named a passenger. */
  readonly bookings: number;
  /** Reviews of those bookings, now by nobody and on no ride. */
  readonly reviews: number;
  /** Removed cars deleted, kept until now only for these trips. */
  readonly cars: number;
  /** Trips that failed, each logged; tried again next hour. */
  readonly failed: number;
}

/** One trip, with the people on it locked; null if held or done meanwhile. */
async function anonymiseTrip(
  db: Database,
  tripId: string,
  now: Date,
): Promise<{ readonly bookings: number; readonly reviews: number; readonly cars: number } | null> {
  return db.transaction(async (tx) => {
    // The people on it, and those its reviews name, locked as an erasure
    // and a new hold lock them: a hold set meanwhile is seen below, and one
    // set after finds the trip done.
    const reviewed = (person: typeof reviews.authorId | typeof reviews.subjectId) =>
      tx.select({ id: person }).from(reviews).where(reviewsOn(tripId, tx));
    const onIt = or(
      inArray(
        users.id,
        tx.select({ id: bookings.passengerId }).from(bookings).where(eq(bookings.tripId, tripId)),
      ),
      inArray(users.id, tx.select({ id: trips.driverId }).from(trips).where(eq(trips.id, tripId))),
      inArray(users.id, reviewed(reviews.authorId)),
      inArray(users.id, reviewed(reviews.subjectId)),
    );
    await tx
      .select({ id: users.id })
      .from(users)
      .where(and(onIt, ne(users.id, formerMemberId)))
      .orderBy(asc(users.id))
      .for("no key update");
    const [trip] = await tx
      .select({ vehicleId: trips.vehicleId })
      .from(trips)
      .where(and(eq(trips.id, tripId), stillNamed(tx), tripNotHeld(tx, now)))
      .for("no key update");
    if (trip === undefined) return null;

    const [named] = await tx
      .select({ count: count() })
      .from(bookings)
      .where(and(eq(bookings.tripId, tripId), ne(bookings.passengerId, formerMemberId)));
    // Its reviews stay for the people they are about, with their stars,
    // comment and dates, but no longer say who wrote them or on which ride
    // (A49), so the ratings stay as they were.
    const unlinked = await tx
      .update(reviews)
      .set({ authorId: formerMemberId, bookingId: null, updatedAt: now })
      .where(reviewsOn(tripId, tx))
      .returning({ id: reviews.id });
    for (const { table, people: persons, emptied, otherIds, column, reach } of tripRecords()) {
      const moved = Object.fromEntries(persons.map((person) => [person, formerMemberId]));
      const changed = "updatedAt" in table ? { updatedAt: now } : {};
      await tx
        .update(table)
        .set({ ...emptiedOf(emptied, column), ...freshIdsOf(otherIds), ...moved, ...changed })
        .where(reach(tripId, tx));
    }

    const oldCar = trip.vehicleId;
    let cars = 0;
    if (oldCar !== null) {
      const car = await formerMembersCar(tx, oldCar, now);
      await tx.update(trips).set({ vehicleId: car, updatedAt: now }).where(eq(trips.id, tripId));
      // A change of car keeps what the passengers were told, not which car.
      await tx
        .update(tripChanges)
        .set({
          before: sql`${tripChanges.before} - 'vehicleId'`,
          after: sql`${tripChanges.after} - 'vehicleId'`,
          updatedAt: now,
        })
        .where(and(eq(tripChanges.tripId, tripId), eq(tripChanges.kind, "vehicle")));
      // A removed car was kept only for the trips that used it (spec 3, 3.2).
      if (car !== oldCar) {
        const deleted = await tx
          .delete(vehicles)
          .where(
            and(
              eq(vehicles.id, oldCar),
              isNotNull(vehicles.removedAt),
              notExists(
                tx.select({ id: trips.id }).from(trips).where(eq(trips.vehicleId, vehicles.id)),
              ),
            ),
          )
          .returning({ id: vehicles.id });
        cars = deleted.length;
      }
    }
    return { bookings: named?.count ?? 0, reviews: unlinked.length, cars };
  });
}

/**
 * The `trips_and_bookings` rule: makes every trip anonymous whose last stop
 * was 3 years ago or more, oldest first, each in its own transaction. A
 * trip that fails is logged and does not stop the others.
 */
export async function anonymiseOldTrips(
  db: Database,
  now: Date,
  logger: Logger,
): Promise<OldTripCounts> {
  const due = await db
    .select({ id: trips.id })
    .from(trips)
    .where(
      and(
        ne(trips.status, "draft"),
        lte(trips.arrivesAt, privacyCutoffs(now).tripsArrivedBy),
        stillNamed(db),
        tripNotHeld(db, now),
      ),
    )
    .orderBy(asc(trips.arrivesAt), asc(trips.id));
  const counts = { trips: 0, bookings: 0, reviews: 0, cars: 0, failed: 0 };
  for (const { id } of due) {
    try {
      const done = await anonymiseTrip(db, id, now);
      if (done === null) continue;
      counts.trips += 1;
      counts.bookings += done.bookings;
      counts.reviews += done.reviews;
      counts.cars += done.cars;
    } catch (error) {
      // Rolled back; tried again next hour.
      logger.error({ tripId: id, err: error }, "trip anonymisation failed");
      counts.failed += 1;
    }
  }
  return counts;
}
