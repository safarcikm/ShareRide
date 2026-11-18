// The console's users, trips and bookings (spec 9, 3.5; milestone 9, PR 8):
// finding people and trips, a person's page and a trip's page, notes
// operators write about a person (who gets them in Download my data, never
// who wrote them; A49), and each driver's request decline rate (3.4.5).
// Suspending and reinstating go through the moderation console service.
import type {
  AdminDeclineRate,
  AdminOperatorNote,
  AdminPerson,
  AdminReview,
  AdminTrip,
  AdminTripListItem,
  AdminUser,
  AdminUserBooking,
  AdminUserListItem,
} from "@shareride/contracts";
import { adminSearchShown } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  checkOperatorNote,
  declineRates,
  defaultReliabilitySettings,
  defaultSafetySettings,
  fromIceland,
  normalisePhoneNumber,
  ok,
  startOfIcelandDay,
  type BookingMode,
  type BookingStatus,
  type CarColour,
  type DeclineReason,
  type OperatorNoteProblem,
  type ReliabilitySettings,
  type Result,
  type Role,
  type SafetySettings,
  type TripStatus,
} from "@shareride/domain";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { recordAudit } from "../admin/audit.ts";
import { figuresOf } from "../people/standing.ts";
import { createConsoleReads, iso, type ConsoleStop } from "./console-reads.ts";
import type { ConsoleActor } from "./console.ts";

const {
  bookings,
  formerMemberId,
  meetingPoints,
  moderationActions,
  operatorNotes,
  reports,
  reviews,
  segments,
  tripStops,
  trips,
  users,
  vehicles,
} = schema;

/** A person's trips, bookings, reports, reviews and actions on their page. */
const historyShown = 20;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TripFilters {
  /** The day it departs in Iceland, as YYYY-MM-DD. */
  readonly date?: string | undefined;
  readonly place?: string | undefined;
  readonly driverId?: string | undefined;
  /** A trip's ID, or a booking's. */
  readonly id?: string | undefined;
}

export type AddNoteError = { readonly code: "not_found" } | OperatorNoteProblem;

/** What a search found, at most `adminSearchShown`; `more` when there were more. */
export interface Found<Item> {
  readonly items: readonly Item[];
  readonly more: boolean;
}

export interface PeopleConsoleService {
  users(q: string): Promise<Found<AdminUserListItem>>;
  user(id: string): Promise<AdminUser | undefined>;
  addNote(
    userId: string,
    text: string,
    actor: ConsoleActor,
  ): Promise<Result<AdminOperatorNote, AddNoteError>>;
  trips(filters: TripFilters): Promise<Found<AdminTripListItem>>;
  trip(id: string): Promise<AdminTrip | undefined>;
  declineRates(): Promise<readonly AdminDeclineRate[]>;
}

/** `%` and `_` in what the operator typed match themselves. */
const likeText = (text: string) => `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;

const collator = new Intl.Collator("is");

export function createPeopleConsoleService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings?: SafetySettings;
  readonly reliability?: ReliabilitySettings;
}): PeopleConsoleService {
  const { db, clock } = dependencies;
  const settings = dependencies.settings ?? defaultSafetySettings;
  const reliability = dependencies.reliability ?? defaultReliabilitySettings;
  const { peopleOf, listItems, actionsWhere, stopsOf, shownStop, routeOf } = createConsoleReads({
    db,
    settings,
  });

  /** The person these IDs name; a missing one reads as the former member would. */
  async function peopleFor(ids: readonly (string | null)[]) {
    const people = await peopleOf(ids);
    return (id: string): AdminPerson =>
      people.get(id) ?? {
        userId: id,
        firstName: null,
        status: "deleted",
        suspendedUntil: null,
        locale: "is",
      };
  }

  const listColumns = {
    id: users.id,
    phone: users.phoneE164,
    email: users.email,
    createdAt: users.createdAt,
  };

  async function listOf(
    rows: readonly { id: string; phone: string | null; email: string | null; createdAt: Date }[],
  ): Promise<AdminUserListItem[]> {
    const person = await peopleFor(rows.map((row) => row.id));
    return rows.map((row) => ({
      person: person(row.id),
      phone: row.phone,
      email: row.email,
      joinedAt: row.createdAt.toISOString(),
    }));
  }

  /** Trips as lists show them, in the order given. */
  async function tripItems(
    rows: readonly {
      id: string;
      driverId: string;
      status: string;
      departsAt: Date | null;
      capacity: number;
    }[],
  ): Promise<AdminTripListItem[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const stops = await stopsOf(ids);
    const person = await peopleFor(rows.map((row) => row.driverId));
    const busiest = await db
      .select({ tripId: segments.tripId, held: max(segments.occupancy) })
      .from(segments)
      .where(inArray(segments.tripId, ids))
      .groupBy(segments.tripId);
    const held = new Map(busiest.map((row) => [row.tripId, row.held ?? 0]));
    return rows.map((row) => ({
      id: row.id,
      driver: person(row.driverId),
      status: row.status as TripStatus,
      ...routeOf(stops, row.id),
      departsAt: iso(row.departsAt),
      capacity: row.capacity,
      seatsHeld: held.get(row.id) ?? 0,
    }));
  }

  const tripColumns = {
    id: trips.id,
    driverId: trips.driverId,
    status: trips.status,
    departsAt: trips.departsAt,
    capacity: trips.capacity,
  };

  const bookingColumns = {
    id: bookings.id,
    tripId: bookings.tripId,
    passengerId: bookings.passengerId,
    status: bookings.status,
    seats: bookings.seats,
    fromStopId: bookings.fromStopId,
    toStopId: bookings.toStopId,
    totalPrice: bookings.totalPrice,
    requestedAt: bookings.requestedAt,
    declineReason: bookings.declineReason,
  };

  interface BookingRow {
    readonly id: string;
    readonly status: string;
    readonly seats: number;
    readonly fromStopId: string;
    readonly toStopId: string;
    readonly totalPrice: number;
    readonly requestedAt: Date | null;
    readonly declineReason: string | null;
  }

  function bookingOf(row: BookingRow, stops: ReadonlyMap<string, ConsoleStop>) {
    return {
      id: row.id,
      status: row.status as BookingStatus,
      seats: row.seats,
      from: shownStop(stops.get(row.fromStopId)),
      to: shownStop(stops.get(row.toStopId)),
      totalPrice: { amount: row.totalPrice, currency: "ISK" as const },
      requestedAt: iso(row.requestedAt),
      declineReason: row.declineReason as DeclineReason | null,
    };
  }

  /** The requests made of drivers in the decline-rate window, optionally one driver's. */
  async function requestRows(driverId?: string) {
    const since = new Date(clock().getTime() - settings.declineRateDays * 86_400_000);
    const rows = await db
      .select({
        driverId: trips.driverId,
        status: bookings.status,
        requestedAt: bookings.requestedAt,
        decidedAt: bookings.decidedAt,
        cancelledAt: bookings.cancelledAt,
        declineReason: bookings.declineReason,
      })
      .from(bookings)
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .where(
        and(
          gte(bookings.requestedAt, since),
          isNotNull(bookings.decidedAt),
          ne(trips.driverId, formerMemberId),
          driverId === undefined ? undefined : eq(trips.driverId, driverId),
        ),
      );
    return declineRates(
      rows.map((row) => ({
        ...row,
        status: row.status as BookingStatus,
        declineReason: row.declineReason as DeclineReason | null,
      })),
      clock(),
      settings,
    );
  }

  async function notesOf(userId: string): Promise<AdminOperatorNote[]> {
    const rows = await db
      .select()
      .from(operatorNotes)
      .where(eq(operatorNotes.userId, userId))
      .orderBy(desc(operatorNotes.createdAt), desc(operatorNotes.id));
    const people = await peopleOf(rows.map((row) => row.byId));
    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      by: row.byId === null ? null : (people.get(row.byId) ?? null),
      at: row.createdAt.toISOString(),
    }));
  }

  return {
    async users(q) {
      const wanted = q.trim();
      let match: SQL;
      if (uuidPattern.test(wanted)) {
        match = eq(users.id, wanted.toLowerCase());
      } else if (wanted.includes("@")) {
        match = eq(sql`lower(${users.email})`, wanted.toLowerCase());
      } else {
        const phone = normalisePhoneNumber(wanted);
        match = phone.ok
          ? eq(users.phoneE164, phone.value.e164)
          : ilike(users.firstName, likeText(wanted));
      }
      const rows = await db
        .select(listColumns)
        .from(users)
        .where(and(match, ne(users.id, formerMemberId)))
        .orderBy(asc(users.firstName), asc(users.id))
        .limit(adminSearchShown + 1);
      const found = await listOf(rows.slice(0, adminSearchShown));
      // The database's order may not be Iceland's, so a list cut short says
      // so and the operator narrows the search.
      return {
        items: found.sort((a, b) =>
          collator.compare(a.person.firstName ?? "", b.person.firstName ?? ""),
        ),
        more: rows.length > adminSearchShown,
      };
    },

    async user(id) {
      if (id === formerMemberId) return undefined;
      const [row] = await db.select().from(users).where(eq(users.id, id));
      if (row === undefined) return undefined;
      const [item] = await listOf([
        { id: row.id, phone: row.phoneE164, email: row.email, createdAt: row.createdAt },
      ]);
      if (item === undefined) throw new Error("A person lists as themselves.");

      const cars = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.ownerId, id))
        .orderBy(asc(vehicles.createdAt), asc(vehicles.id));
      const driven = await db
        .select(tripColumns)
        .from(trips)
        .where(and(eq(trips.driverId, id), ne(trips.status, "draft")))
        .orderBy(desc(trips.departsAt), desc(trips.id))
        .limit(historyShown);
      const booked = await db
        .select({ ...bookingColumns, driverId: trips.driverId, departsAt: trips.departsAt })
        .from(bookings)
        .innerJoin(trips, eq(trips.id, bookings.tripId))
        .where(eq(bookings.passengerId, id))
        .orderBy(desc(trips.departsAt), desc(bookings.createdAt), desc(bookings.id))
        .limit(historyShown);
      const bookedStops = new Map(
        (await stopsOf(booked.map((booking) => booking.tripId))).map((stop) => [stop.id, stop]),
      );
      const driverOf = await peopleFor(booked.map((booking) => booking.driverId));
      const userBookings: AdminUserBooking[] = booked.map((booking) => ({
        ...bookingOf(booking, bookedStops),
        tripId: booking.tripId,
        driver: driverOf(booking.driverId),
        departsAt: iso(booking.departsAt),
      }));
      const reportsWhere = (side: "reporterId" | "subjectUserId") =>
        db
          .select()
          .from(reports)
          .where(eq(reports[side], id))
          .orderBy(desc(reports.createdAt), desc(reports.id))
          .limit(historyShown);
      const [declines] = await requestRows(id);
      const reviewsWhere = (side: "authorId" | "subjectId") =>
        db
          .select()
          .from(reviews)
          .where(eq(reviews[side], id))
          .orderBy(desc(reviews.createdAt), desc(reviews.id))
          .limit(historyShown);
      const about = await reviewsWhere("subjectId");
      const by = await reviewsWhere("authorId");
      const reviewer = await peopleFor([...about, ...by].flatMap((r) => [r.authorId, r.subjectId]));
      const reviewOf = (review: (typeof about)[number]): AdminReview => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        authorRole: review.authorRole as Role,
        author: reviewer(review.authorId),
        subject: reviewer(review.subjectId),
        writtenAt: review.createdAt.toISOString(),
        revealed: review.revealedAt !== null,
        hidden: review.hiddenAt !== null,
      });

      return {
        ...item,
        phoneVerifiedAt: iso(row.phoneVerifiedAt),
        emailVerifiedAt: iso(row.emailVerifiedAt),
        ageConfirmedAt: iso(row.ageConfirmedAt),
        licenceDeclaredAt: iso(row.licenceDeclaredAt),
        languages: row.languages,
        about:
          row.about === null || row.about === ""
            ? null
            : { text: row.about, hidden: row.aboutHiddenAt !== null },
        deleteAfter: iso(row.deleteAfter),
        ...(await figuresOf(db, id, clock(), reliability)),
        reviewsAbout: about.map(reviewOf),
        reviewsBy: by.map(reviewOf),
        vehicles: cars.map((car) => ({
          id: car.id,
          make: car.make,
          model: car.model,
          colour: car.colour as CarColour,
          registration: car.registration,
          removed: car.removedAt !== null,
        })),
        trips: await tripItems(driven),
        bookings: userBookings,
        reportsBy: await listItems(await reportsWhere("reporterId")),
        reportsAbout: await listItems(await reportsWhere("subjectUserId")),
        actions: await actionsWhere(eq(moderationActions.userId, id), true, historyShown),
        notes: await notesOf(id),
        declines:
          declines === undefined
            ? null
            : {
                answered: declines.answered,
                declined: declines.declined,
                reasons: declines.reasons,
              },
      };
    },

    async addNote(userId, text, actor) {
      const checked = checkOperatorNote(text, settings);
      if (!checked.ok) return checked;
      if (userId === formerMemberId) return { ok: false, error: { code: "not_found" } };
      const now = clock();
      const noteId = await db.transaction(async (tx) => {
        const [person] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .for("no key update");
        if (person === undefined) return undefined;
        const [stored] = await tx
          .insert(operatorNotes)
          .values({
            userId,
            text: checked.value,
            byId: actor.operator.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: operatorNotes.id });
        if (stored === undefined) throw new Error("The note was just stored.");
        // The note's ID, never its words (spec 9, section 7).
        await recordAudit(tx, {
          operator: actor.operator,
          action: "user.note_added",
          subjectType: "user",
          subjectId: userId,
          after: { noteId: stored.id },
          request: actor.request,
        });
        return stored.id;
      });
      if (noteId === undefined) return { ok: false, error: { code: "not_found" } };
      const note = (await notesOf(userId)).find((each) => each.id === noteId);
      if (note === undefined) throw new Error("The note was just stored.");
      return ok(note);
    },

    async trips(filters) {
      const conditions: (SQL | undefined)[] = [ne(trips.status, "draft")];
      if (filters.date !== undefined) {
        const [year = 0, month = 0, day = 0] = filters.date.split("-").map(Number);
        conditions.push(
          gte(trips.departsAt, fromIceland({ year, month, day, hour: 0, minute: 0 })),
          lt(trips.departsAt, fromIceland({ year, month, day: day + 1, hour: 0, minute: 0 })),
        );
      }
      if (filters.place !== undefined) {
        const named = likeText(filters.place.trim());
        conditions.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(tripStops)
              .innerJoin(meetingPoints, eq(meetingPoints.id, tripStops.meetingPointId))
              .where(
                and(
                  eq(tripStops.tripId, trips.id),
                  isNull(tripStops.removedAt),
                  or(ilike(meetingPoints.nameIs, named), ilike(meetingPoints.nameEn, named)),
                ),
              ),
          ),
        );
      }
      if (filters.driverId !== undefined) conditions.push(eq(trips.driverId, filters.driverId));
      if (filters.id !== undefined) {
        const bookingTrip = db
          .select({ tripId: bookings.tripId })
          .from(bookings)
          .where(eq(bookings.id, filters.id));
        conditions.push(or(eq(trips.id, filters.id), inArray(trips.id, bookingTrip)));
      }
      const filtered = conditions.length > 1;
      // With nothing to look for, what is coming up, the soonest first.
      if (!filtered) conditions.push(gte(trips.departsAt, startOfIcelandDay(clock())));
      const rows = await db
        .select(tripColumns)
        .from(trips)
        .where(and(...conditions))
        .orderBy(
          ...(filtered
            ? [desc(trips.departsAt), desc(trips.id)]
            : [asc(trips.departsAt), asc(trips.id)]),
        )
        .limit(adminSearchShown + 1);
      return {
        items: await tripItems(rows.slice(0, adminSearchShown)),
        more: rows.length > adminSearchShown,
      };
    },

    async trip(id) {
      const [row] = await db
        .select({
          ...tripColumns,
          vehicleId: trips.vehicleId,
          bookingMode: trips.bookingMode,
          note: trips.note,
          noteHiddenAt: trips.noteHiddenAt,
          cancelledAt: trips.cancelledAt,
          cancelledBy: trips.cancelledBy,
        })
        .from(trips)
        .where(and(eq(trips.id, id), ne(trips.status, "draft")));
      if (row === undefined) return undefined;
      const [item] = await tripItems([row]);
      if (item === undefined) throw new Error("A trip lists as itself.");
      const stops = await stopsOf([id]);
      const [car] =
        row.vehicleId === null
          ? []
          : await db.select().from(vehicles).where(eq(vehicles.id, row.vehicleId));
      const onIt = await db
        .select(bookingColumns)
        .from(bookings)
        .where(eq(bookings.tripId, id))
        .orderBy(asc(bookings.createdAt), asc(bookings.id));
      const byStop = new Map(stops.map((stop) => [stop.id, stop]));
      const passenger = await peopleFor(onIt.map((booking) => booking.passengerId));
      return {
        ...item,
        stops: stops.map((stop) => ({
          ...shownStop(stop),
          removed: stop.removedAt !== null,
        })),
        vehicle:
          car === undefined
            ? null
            : {
                make: car.make,
                model: car.model,
                colour: car.colour as CarColour,
                registration: car.registration,
              },
        bookingMode: row.bookingMode as BookingMode,
        note: row.note,
        noteHidden: row.noteHiddenAt !== null,
        cancelledAt: iso(row.cancelledAt),
        cancelledBy: row.cancelledBy as "driver" | "operator" | null,
        bookings: onIt.map((booking) => ({
          ...bookingOf(booking, byStop),
          passenger: passenger(booking.passengerId),
        })),
      };
    },

    async declineRates() {
      const rates = await requestRows();
      const driver = await peopleFor(rates.map((rate) => rate.driverId));
      return rates.map(({ driverId, answered, declined, reasons }) => ({
        driver: driver(driverId),
        answered,
        declined,
        reasons,
      }));
    },
  };
}
