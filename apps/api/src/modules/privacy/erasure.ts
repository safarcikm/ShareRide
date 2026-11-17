import { personalData, schema, type Database } from "@shareride/db";
import { blockedNumberUntil, type TripDaySettings } from "@shareride/domain";
import {
  and,
  asc,
  eq,
  getTableColumns,
  getTableName,
  gt,
  inArray,
  is,
  lte,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { PgTable, type PgColumn } from "drizzle-orm/pg-core";
import type { Logger } from "../../logger.ts";
import type { KeyedHasher } from "../../platform/crypto.ts";
import type { Transaction } from "../bookings/seats.ts";
import { lockDrivenTrips, openFor } from "./deletion.ts";

const {
  blockedNumbers,
  bookings,
  erasedAccounts,
  formerMemberId,
  messages,
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
// trip nobody booked, cars no trip used, their reminders) goes.

const tables = new Map(
  (Object.values(schema) as unknown[])
    .filter((value): value is PgTable => is(value, PgTable))
    .map((table) => [getTableName(table), table]),
);

/** What an emptied column holds: nothing, or an empty text or list where it must hold one. */
function emptyValue(column: PgColumn): unknown {
  if (!column.notNull) return null;
  if (column.columnType === "PgText") return "";
  if (column.columnType === "PgArray") return [];
  throw new Error(`No empty value for ${column.name}.`);
}

/** Erases one account inside `tx`, with its row locked. */
async function eraseAccount(
  tx: Transaction,
  user: { readonly id: string; readonly phoneE164: string | null; readonly status: string },
  now: Date,
  hasher: KeyedHasher,
): Promise<void> {
  const userId = user.id;

  // What was theirs alone. Drafts go, with their stops; a trip to come that
  // nobody holds a seat on is cancelled, telling nobody.
  await tx.delete(trips).where(and(eq(trips.driverId, userId), eq(trips.status, "draft")));
  await tx
    .update(trips)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancelReason: "other",
      countsOnReliability: false,
      updatedAt: now,
    })
    .where(
      and(eq(trips.driverId, userId), eq(trips.status, "published"), gt(trips.departsAt, now)),
    );
  // Reminders of their trips and bookings, all over or cancelled by now.
  await tx
    .delete(scheduledNotifications)
    .where(
      or(
        inArray(
          scheduledNotifications.tripId,
          tx.select({ id: trips.id }).from(trips).where(eq(trips.driverId, userId)),
        ),
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

  // Then every table as the catalogue says.
  for (const [name, entry] of Object.entries(personalData)) {
    const deletion = entry.onDeletion;
    if (deletion === null || deletion.rows === "leave" || entry.personColumns.length === 0) {
      continue;
    }
    const table = tables.get(name);
    if (table === undefined) throw new Error(`The catalogue names ${name}, which does not exist.`);
    const columns = getTableColumns(table) as Record<string, PgColumn>;
    const column = (key: string) => {
      const found = columns[key];
      if (found === undefined) throw new Error(`The catalogue names ${name}.${key}.`);
      return found;
    };
    for (const person of entry.personColumns) {
      if (deletion.rows === "erase") {
        await tx.delete(table).where(eq(column(person), userId));
        continue;
      }
      const emptied = Object.fromEntries(
        deletion.emptied.map((key) => [key, emptyValue(column(key))]),
      );
      // A message keeps when it was sent, and reads "Message deleted".
      const marked = table === messages ? { erasedAt: now } : {};
      await tx
        .update(table)
        .set({ ...emptied, ...marked, [person]: formerMemberId })
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
   * how many, and how many failed. A failure is logged and does not stop
   * the others.
   */
  eraseDue(): Promise<{ readonly erased: number; readonly failed: number }>;
  /** Erases one account if its wait has ended and nothing is open; whether it did. */
  eraseOne(userId: string): Promise<boolean>;
  /**
   * After a restore (runbook, "Restore the database"): records here the
   * erasures `previous` lists, read from the old database, then erases
   * again each erased account that came back; how many.
   */
  reapply(previous?: readonly ErasedAccount[]): Promise<number>;
}

/** An erasure as `erased_accounts` keeps it. */
export interface ErasedAccount {
  readonly userId: string;
  readonly erasedAt: Date;
}

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

    async reapply(previous = []) {
      // Kept here too, so a later restore of this database repeats them.
      for (let start = 0; start < previous.length; start += 1000) {
        await db
          .insert(erasedAccounts)
          .values(previous.slice(start, start + 1000))
          .onConflictDoNothing();
      }
      const back = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(erasedAccounts, eq(erasedAccounts.userId, users.id));
      let erased = 0;
      for (const { id } of back) if (await erase(id, { again: true })) erased += 1;
      return erased;
    },
  };
}
