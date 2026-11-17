import { personalData, schema, type Database } from "@shareride/db";
import {
  blockedNumberUntil,
  bookingStatuses,
  holdsSeats,
  type TripDaySettings,
} from "@shareride/domain";
import { and, asc, eq, inArray, lte, notExists, or, sql } from "drizzle-orm";
import type { Logger } from "../../logger.ts";
import type { KeyedHasher } from "../../platform/crypto.ts";
import type { Transaction } from "../bookings/seats.ts";
import { catalogued, emptiedOf, freshIdsOf, tableOf } from "./catalogue.ts";
import { lockDrivenTrips, openFor } from "./deletion.ts";
import { accountHeld } from "./holds.ts";

const {
  blockedNumbers,
  bookings,
  conversations,
  erasedAccounts,
  formerMemberId,
  messages,
  reviews,
  scheduledNotifications,
  trips,
  users,
  vehicles,
} = schema;

// Erasure, 7 days after "Delete my account" (spec 11, 3.5; plan 4.6). The
// personal data catalogue (packages/db/src/personal-data.ts) says what
// happens to each table: its rows about the person are deleted, moved to
// the one shared former member with their free text emptied, or left as
// they are. A few steps come first: what was the person's alone (drafts, a
// trip nobody booked, cars no trip used, their reminders) goes, and their
// free text kept where only a booking points at them is emptied.

/** Bookings someone rode on or still holds seats with: a trip with one is not cancelled. */
const rodeOrHolding = bookingStatuses.filter(
  (status) => holdsSeats(status) || status === "completed" || status === "no_show",
);

/** Erases one account inside `tx`, with its row locked. */
async function eraseAccount(
  tx: Transaction,
  user: { readonly id: string; readonly phoneE164: string | null; readonly status: string },
  now: Date,
  hasher: KeyedHasher,
): Promise<void> {
  const userId = user.id;

  const theirTrips = () =>
    tx.select({ id: trips.id }).from(trips).where(eq(trips.driverId, userId));
  const theirBookings = () =>
    tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(or(eq(bookings.passengerId, userId), inArray(bookings.tripId, theirTrips())));

  // What was theirs alone. Drafts go, with their stops. A trip nobody rode
  // or holds a seat on is cancelled, telling nobody, even one that has left
  // its first stop and still takes bookings at later ones (A45).
  await tx.delete(trips).where(and(eq(trips.driverId, userId), eq(trips.status, "draft")));
  await tx
    .update(trips)
    .set({
      status: "cancelled",
      cancelledAt: now,
      // Theirs to end: they deleted their account.
      cancelledBy: "driver",
      cancelReason: "other",
      countsOnReliability: false,
      updatedAt: now,
    })
    .where(
      and(
        eq(trips.driverId, userId),
        inArray(trips.status, ["published", "departed"]),
        notExists(
          tx
            .select({ id: bookings.id })
            .from(bookings)
            .where(and(eq(bookings.tripId, trips.id), inArray(bookings.status, rodeOrHolding))),
        ),
      ),
    );
  // Reminders of their trips and bookings, all over or cancelled by now.
  await tx
    .delete(scheduledNotifications)
    .where(
      or(
        inArray(scheduledNotifications.tripId, theirTrips()),
        inArray(
          scheduledNotifications.bookingId,
          tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.passengerId, userId)),
        ),
      ),
    );
  // Cars no trip used; the others stay with their trips, without the plate.
  await tx
    .delete(vehicles)
    .where(
      and(
        eq(vehicles.ownerId, userId),
        notExists(tx.select({ id: trips.id }).from(trips).where(eq(trips.vehicleId, vehicles.id))),
      ),
    );

  // A driver's cancel note is copied to each booking and its chat line
  // (spec 6, 3.3): those go as the trip's own note does.
  await tx
    .update(bookings)
    .set({ cancelNote: "" })
    .where(and(inArray(bookings.tripId, theirTrips()), eq(bookings.cancelledBy, "driver")));
  await tx
    .update(messages)
    .set({ params: sql`jsonb_set(${messages.params}, '{note}', '""')` })
    .where(
      and(
        eq(messages.kind, "system"),
        eq(messages.key, "cancelled"),
        sql`${messages.params}->>'by' = 'driver'`,
        sql`${messages.params}->'note' is not null`,
        inArray(
          messages.conversationId,
          tx
            .select({ id: conversations.id })
            .from(conversations)
            .innerJoin(bookings, eq(bookings.id, conversations.bookingId))
            .where(inArray(bookings.tripId, theirTrips())),
        ),
      ),
    );

  // The reviews about the person go with them (spec 11, 3.5); those they
  // wrote move to the former member below. Done first, a review between two
  // people who both leave never ends up by and about the former member.
  await tx.delete(reviews).where(eq(reviews.subjectId, userId));

  // Then every table as the catalogue says. First the rows only a booking
  // links to the person, such as a report about a ride, while their
  // bookings and trips still name them: kept, with their free text emptied.
  // Rows erased with no person column go with what they belong to.
  for (const { name, deletion, column } of catalogued()) {
    if (deletion.rows !== "keep" || deletion.emptied.length === 0) continue;
    if (personalData[name]?.personColumns.length !== 0) continue;
    await tx
      .update(tableOf(name))
      .set(emptiedOf(deletion.emptied, column))
      .where(inArray(column("bookingId"), theirBookings()));
  }
  for (const { name, entry, deletion, column } of catalogued()) {
    const table = tableOf(name);
    for (const person of entry.personColumns) {
      if (deletion.rows === "erase") {
        await tx.delete(table).where(eq(column(person), userId));
        continue;
      }
      // A message keeps when it was sent, and reads "Message deleted".
      const marked = table === messages ? { erasedAt: now } : {};
      await tx
        .update(table)
        .set({
          ...emptiedOf(deletion.emptied, column),
          ...freshIdsOf(entry.otherIds),
          ...marked,
          [person]: formerMemberId,
        })
        .where(eq(column(person), userId));
    }
  }

  // A suspended person's number cannot sign up again for a while (R11.9).
  // Suspensions have no end date yet (safety, spec 9), so the longest.
  const until = user.status === "suspended" ? blockedNumberUntil(null, now) : null;
  if (until !== null && user.phoneE164 !== null) {
    await tx
      .insert(blockedNumbers)
      .values({ phoneHash: hasher("phone", user.phoneE164), until })
      .onConflictDoUpdate({
        target: blockedNumbers.phoneHash,
        set: { until: sql`greatest(${blockedNumbers.until}, excluded.until)` },
      });
  }
  // Erased again after a restore, it keeps the first time.
  await tx.insert(erasedAccounts).values({ userId, erasedAt: now }).onConflictDoNothing();
  await tx.delete(users).where(eq(users.id, userId));
}

export interface ErasureDependencies {
  readonly db: Database;
  readonly clock: () => Date;
  readonly hasher: KeyedHasher;
  readonly tripDaySettings: TripDaySettings;
  readonly logger: Logger;
}

export interface Erasure {
  /**
   * Erases every account whose wait has ended (the hourly `accounts` rule):
   * how many, and how many failed. An account with something open, or held,
   * waits. A failure is logged and does not stop the others.
   */
  eraseDue(): Promise<{ readonly erased: number; readonly failed: number }>;
  /** Erases one account if its wait has ended and nothing is open; whether it did. */
  eraseOne(userId: string): Promise<boolean>;
  /**
   * After a restore (runbook, "Restore the database"). With what the old
   * database says: takes each deletion date changed there after this
   * database's last change to the account, and records its erasures here.
   * Then erases again each erased account that came back, whatever is open
   * or held in the restored copy: it was erased once already. A failure is
   * logged and does not stop the others.
   */
  reapply(before?: BeforeRestore): Promise<ReapplyCounts>;
}

/** An erasure as `erased_accounts` keeps it. */
export interface ErasedAccount {
  readonly userId: string;
  readonly erasedAt: Date;
}

/** What the database in use before a restore says. */
export interface BeforeRestore {
  readonly erasures: readonly ErasedAccount[];
  /** Every account there: its deletion date, and when the account last changed. */
  readonly accounts: readonly {
    readonly userId: string;
    readonly deleteAfter: Date | null;
    readonly updatedAt: Date;
  }[];
}

export interface ReapplyCounts {
  /** Deletion dates asked for, or undone, in the old database since the restore's point. */
  readonly datesTaken: number;
  readonly erased: number;
  readonly failed: number;
}

const batch = 1000;

export function createErasure(dependencies: ErasureDependencies): Erasure {
  const { db, clock, hasher, tripDaySettings, logger } = dependencies;

  async function erase(userId: string, { again }: { readonly again: boolean }) {
    const now = clock();
    return db.transaction(async (tx) => {
      // The person's row, then their trips, as booking and deleting take them.
      const [user] = await tx
        .select({
          id: users.id,
          phoneE164: users.phoneE164,
          status: users.status,
          deleteAfter: users.deleteAfter,
        })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (user === undefined || user.id === formerMemberId) return false;
      if (!again) {
        // Kept meanwhile, or not yet due: checked again under the lock.
        if (user.deleteAfter === null || user.deleteAfter > now) return false;
        await lockDrivenTrips(tx, userId);
        if (!(await openFor(tx, userId, now, tripDaySettings)).allowed) {
          logger.warn({ userId }, "account erasure waits: something is open");
          return false;
        }
        // Kept for a dispute or claim until the hold ends (spec 11, 3.7.3).
        if (await accountHeld(tx, userId, now)) {
          logger.info({ userId }, "account erasure waits: held");
          return false;
        }
      }
      await eraseAccount(tx, user, now, hasher);
      logger.info({ userId, again }, "account erased");
      return true;
    });
  }

  return {
    async eraseDue() {
      const due = await db
        .select({ id: users.id })
        .from(users)
        .where(lte(users.deleteAfter, clock()))
        .orderBy(asc(users.deleteAfter));
      let erased = 0;
      let failed = 0;
      for (const { id } of due) {
        try {
          if (await erase(id, { again: false })) erased += 1;
        } catch (error) {
          // Rolled back; tried again next hour.
          logger.error({ userId: id, err: error }, "account erasure failed");
          failed += 1;
        }
      }
      return { erased, failed };
    },

    eraseOne(userId) {
      return erase(userId, { again: false });
    },

    async reapply(before = { erasures: [], accounts: [] }) {
      // "Delete my account" or "Keep my account" pressed after the
      // restore's point: the later change wins, so running this again once
      // the services use this database undoes nothing done here since.
      let datesTaken = 0;
      for (let start = 0; start < before.accounts.length; start += batch) {
        const part = before.accounts.slice(start, start + batch);
        const taken = await db.execute(sql`
          update ${users} set delete_after = old.delete_after, updated_at = old.updated_at
          from unnest(
            ${sql.param(part.map((account) => account.userId))}::uuid[],
            ${sql.param(part.map((account) => account.deleteAfter?.toISOString() ?? null))}::timestamptz[],
            ${sql.param(part.map((account) => account.updatedAt.toISOString()))}::timestamptz[]
          ) as old(id, delete_after, updated_at)
          where ${users.id} = old.id
            and old.updated_at > ${users.updatedAt}
            and old.delete_after is distinct from ${users.deleteAfter}`);
        datesTaken += taken.rowCount ?? 0;
      }
      // Kept here too, so a later restore of this database repeats them.
      for (let start = 0; start < before.erasures.length; start += batch) {
        await db
          .insert(erasedAccounts)
          .values(before.erasures.slice(start, start + batch))
          .onConflictDoNothing();
      }
      const back = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(erasedAccounts, eq(erasedAccounts.userId, users.id));
      let erased = 0;
      let failed = 0;
      for (const { id } of back) {
        try {
          if (await erase(id, { again: true })) erased += 1;
        } catch (error) {
          logger.error({ userId: id, err: error }, "account erasure failed");
          failed += 1;
        }
      }
      return { datesTaken, erased, failed };
    },
  };
}
