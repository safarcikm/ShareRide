import type { BlockedPerson, Booking } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  bookingStatuses,
  checkBlock,
  err,
  hiddenFrom,
  holdsSeats,
  ok,
  peopleColourOf,
  tripClosedTo,
  type Block,
  type Result,
} from "@shareride/domain";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import type { BookingService } from "../bookings/index.ts";
import type { Queryable } from "../bookings/seats.ts";

const { blocks, bookings, trips, users } = schema;

/** Bookings that hold seats (rule S1), as stored. */
const holding = bookingStatuses.filter(holdsSeats);

/** The blocks between `userId` and anyone, whichever of the two made them. */
export async function blocksOf(q: Queryable, userId: string): Promise<Block[]> {
  return q
    .select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
    .from(blocks)
    .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));
}

/**
 * The trips among `tripIds` closed to `userId` by a block with their driver
 * (R9.4), except those `userId` is booked on. Signed out, nothing is
 * closed. A booking's stored status is used: a request or payment past its
 * deadline is stored as expired within the minute.
 */
export async function closedTrips(
  q: Queryable,
  userId: string | null,
  tripIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (userId === null || tripIds.length === 0) return new Set();
  const mine = await blocksOf(q, userId);
  if (hiddenFrom(mine, userId).size === 0) return new Set();
  // One query at a time: a transaction has one connection.
  const driven = await q
    .select({ id: trips.id, driverId: trips.driverId })
    .from(trips)
    .where(inArray(trips.id, [...tripIds]));
  const booked = await q
    .select({ tripId: bookings.tripId })
    .from(bookings)
    .where(
      and(
        inArray(bookings.tripId, [...tripIds]),
        eq(bookings.passengerId, userId),
        inArray(bookings.status, holding),
      ),
    );
  const bookedOn = new Set(booked.map((row) => row.tripId));
  return new Set(
    driven
      .filter((trip) =>
        tripClosedTo(userId, { driverId: trip.driverId, bookedByMe: bookedOn.has(trip.id) }, mine),
      )
      .map((trip) => trip.id),
  );
}

export type BlockError = { readonly code: "not_found" };

/** Blocking and unblocking (spec 9, 3.2): silent, and seen only by the blocker. */
export interface BlockService {
  /**
   * Blocks the other person of my booking, or of a booking on my trip; safe
   * to repeat, keeping the first time. Gives the bookings and requests we
   * still have together before boarding, as I see them, so I can cancel,
   * withdraw or decline them under the usual rules (spec 9, decision 1).
   */
  blockFromBooking(me: string, bookingId: string): Promise<Result<Booking[], BlockError>>;
  /** Lifts a block I made, never one made against me; safe to repeat. */
  unblock(me: string, blockId: string): Promise<void>;
  /** The people I blocked, the latest first. */
  blocked(me: string): Promise<BlockedPerson[]>;
}

export function createBlockService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly bookings: Pick<BookingService, "bookingsOf">;
}): BlockService {
  const { db, clock } = dependencies;
  return {
    async blockFromBooking(me, bookingId) {
      const [booking] = await db
        .select({ passengerId: bookings.passengerId, driverId: trips.driverId })
        .from(bookings)
        .innerJoin(trips, eq(trips.id, bookings.tripId))
        .where(eq(bookings.id, bookingId));
      if (booking === undefined || (booking.passengerId !== me && booking.driverId !== me)) {
        return err({ code: "not_found" });
      }
      const other = booking.passengerId === me ? booking.driverId : booking.passengerId;
      const checked = checkBlock(me, other);
      if (!checked.ok) return err({ code: "not_found" });

      const shared = await db.transaction(async (tx) => {
        // Both people, in ID order: booking and sending a message lock the
        // passenger or sender first, so a booking made at the same moment
        // is either refused by the block or listed below. Not a full update
        // lock: a report filed at the same moment checks its key on one of
        // us and must not wait on this, or the two would deadlock.
        await tx
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.id, [me, other]))
          .orderBy(asc(users.id))
          .for("no key update");
        const now = clock();
        await tx
          .insert(blocks)
          .values({ blockerId: me, blockedId: other, createdAt: now, updatedAt: now })
          .onConflictDoNothing();
        // Either of us the passenger, the other the driver.
        return tx
          .select({ id: bookings.id })
          .from(bookings)
          .innerJoin(trips, eq(trips.id, bookings.tripId))
          .where(
            and(
              inArray(bookings.status, holding),
              or(
                and(eq(bookings.passengerId, me), eq(trips.driverId, other)),
                and(eq(bookings.passengerId, other), eq(trips.driverId, me)),
              ),
            ),
          );
      });
      const now = clock();
      const together = await dependencies.bookings.bookingsOf(
        me,
        shared.map((row) => row.id),
      );
      return ok(
        together
          .filter(
            (found) =>
              holdsSeats(found.status) && Date.parse(found.board.plannedAt) > now.getTime(),
          )
          .sort((a, b) => Date.parse(a.board.plannedAt) - Date.parse(b.board.plannedAt)),
      );
    },

    async unblock(me, blockId) {
      await db.delete(blocks).where(and(eq(blocks.id, blockId), eq(blocks.blockerId, me)));
    },

    async blocked(me) {
      const rows = await db
        .select({
          id: blocks.id,
          blockedId: blocks.blockedId,
          firstName: users.firstName,
          at: blocks.createdAt,
        })
        .from(blocks)
        .innerJoin(users, eq(users.id, blocks.blockedId))
        .where(eq(blocks.blockerId, me))
        .orderBy(desc(blocks.createdAt), desc(blocks.id));
      return rows.map((row) => ({
        id: row.id,
        firstName: row.firstName ?? "",
        colour: peopleColourOf(row.blockedId),
        blockedAt: row.at.toISOString(),
      }));
    },
  };
}
