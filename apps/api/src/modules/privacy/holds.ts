import { schema, type Database } from "@shareride/db";
import {
  err,
  ok,
  operatorRole,
  validateHold,
  type HoldError,
  type HoldSubject,
  type HoldSubjectKind,
  type Result,
} from "@shareride/domain";
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  notExists,
  or,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { recordAudit } from "../admin/audit.ts";
import type { Transaction } from "../bookings/seats.ts";

const { bookings, holds, trips, users } = schema;

type Executor = Database | Transaction;

// Holds (spec 11, 3.7.3; R11.6; plan 4.7): records kept past their date
// while a dispute, chargeback or legal claim needs them. Every clean-up rule
// that deletes or changes records about a person, a trip or a booking leaves
// a held one as it is. Codes, tokens, links and hashes are keys rather than
// records, and an export is a copy of what is kept anyway: those go on time.

/** A hold in force at `now`: not ended early, and its end still to come. */
const inForce = (now: Date) => and(isNull(holds.endedAt), gt(holds.endsAt, now));

/**
 * For a clean-up rule's query: no hold in force names any of these, given
 * as the columns of the rows the rule would delete or change.
 */
export function notHeld(
  db: Executor,
  now: Date,
  subjects: readonly (readonly [HoldSubjectKind, AnyColumn])[],
): SQL {
  const named = subjects.map(([kind, column]) =>
    and(eq(holds.subjectType, kind), eq(holds.subjectId, column)),
  );
  return notExists(
    db
      .select({ id: holds.id })
      .from(holds)
      .where(and(inForce(now), or(...named))),
  );
}

/**
 * Whether erasing the account must wait: a hold covers the person, a trip
 * they drove or rode on, or a booking they made or that was on their trip.
 * Erasing would move all of those to the former member and empty their text.
 */
export async function accountHeld(db: Executor, userId: string, now: Date): Promise<boolean> {
  const driven = () => db.select({ id: trips.id }).from(trips).where(eq(trips.driverId, userId));
  const ridden = () =>
    db.select({ id: bookings.tripId }).from(bookings).where(eq(bookings.passengerId, userId));
  const theirBookings = () =>
    db
      .select({ id: bookings.id })
      .from(bookings)
      .where(or(eq(bookings.passengerId, userId), inArray(bookings.tripId, driven())));
  const [found] = await db
    .select({ id: holds.id })
    .from(holds)
    .where(
      and(
        inForce(now),
        or(
          and(eq(holds.subjectType, "user"), eq(holds.subjectId, userId)),
          and(
            eq(holds.subjectType, "trip"),
            or(inArray(holds.subjectId, driven()), inArray(holds.subjectId, ridden())),
          ),
          and(eq(holds.subjectType, "booking"), inArray(holds.subjectId, theirBookings())),
        ),
      ),
    )
    .limit(1);
  return found !== undefined;
}

export interface HoldRecord {
  readonly id: string;
  readonly subject: HoldSubject;
  readonly reason: string;
  readonly endsAt: Date;
  readonly setBy: string;
  readonly endedAt: Date | null;
}

export type SetHoldError =
  HoldError | { readonly code: "subject_not_found" } | { readonly code: "not_an_operator" };

export type EndHoldError =
  | { readonly code: "hold_not_found" }
  | { readonly code: "hold_already_ended" }
  | { readonly code: "not_an_operator" };

export interface Holds {
  /** Sets a hold, with its audit entry. `operatorUserId` must have the operator role. */
  set(input: {
    readonly subject: HoldSubject;
    readonly reason: string;
    readonly endsAt: Date;
    readonly operatorUserId: string;
  }): Promise<Result<HoldRecord, SetHoldError>>;
  /** Ends a hold before its end, with its audit entry. */
  end(input: {
    readonly holdId: string;
    readonly operatorUserId: string;
  }): Promise<Result<HoldRecord, EndHoldError>>;
  /** The holds in force, nearest end first. */
  inForce(): Promise<readonly HoldRecord[]>;
}

const recordOf = (row: typeof holds.$inferSelect): HoldRecord => ({
  id: row.id,
  subject: { kind: row.subjectType as HoldSubjectKind, id: row.subjectId },
  reason: row.reason,
  endsAt: row.endsAt,
  setBy: row.setBy,
  endedAt: row.endedAt,
});

/** An active account with the operator role, not waiting to be deleted. */
export async function isOperator(db: Executor, userId: string): Promise<boolean> {
  const [user] = await db
    .select({ roles: users.roles, status: users.status, deleteAfter: users.deleteAfter })
    .from(users)
    .where(eq(users.id, userId));
  return (
    user !== undefined &&
    user.roles.includes(operatorRole) &&
    user.status === "active" &&
    user.deleteAfter === null
  );
}

/** Which accounts a subject's records belong to: the person, or everyone on the trip or booking. */
function peopleOf(db: Executor, subject: HoldSubject): SQL | undefined {
  switch (subject.kind) {
    case "user":
      return eq(users.id, subject.id);
    case "trip":
      return or(
        inArray(
          users.id,
          db.select({ id: trips.driverId }).from(trips).where(eq(trips.id, subject.id)),
        ),
        inArray(
          users.id,
          db
            .select({ id: bookings.passengerId })
            .from(bookings)
            .where(eq(bookings.tripId, subject.id)),
        ),
      );
    case "booking":
      return or(
        inArray(
          users.id,
          db.select({ id: bookings.passengerId }).from(bookings).where(eq(bookings.id, subject.id)),
        ),
        inArray(
          users.id,
          db
            .select({ id: trips.driverId })
            .from(trips)
            .innerJoin(bookings, eq(bookings.tripId, trips.id))
            .where(eq(bookings.id, subject.id)),
        ),
      );
  }
}

async function subjectExists(db: Executor, subject: HoldSubject): Promise<boolean> {
  const query = () => {
    switch (subject.kind) {
      case "user":
        return db.select({ id: users.id }).from(users).where(eq(users.id, subject.id));
      case "trip":
        return db.select({ id: trips.id }).from(trips).where(eq(trips.id, subject.id));
      case "booking":
        return db.select({ id: bookings.id }).from(bookings).where(eq(bookings.id, subject.id));
    }
  };
  const [found] = await query();
  return found !== undefined && found.id !== schema.formerMemberId;
}

/**
 * Holds, set and ended by an operator through the `privacy` command until
 * the console has a page for them (plan, decision 3). Each change is in the
 * audit log, named by the record held, with no console session.
 */
export function createHolds({ db, clock }: { db: Database; clock: () => Date }): Holds {
  return {
    async set({ subject, reason, endsAt, operatorUserId }) {
      const now = clock();
      const valid = validateHold({ reason, endsAt }, now);
      if (!valid.ok) return valid;
      if (!(await isOperator(db, operatorUserId))) {
        return err({ code: "not_an_operator" });
      }
      const row = await db.transaction(async (tx) => {
        // The people the records belong to, locked as an erasure locks its
        // account first: one under way finishes, and this then sees what it
        // left; one that comes later sees the hold.
        await tx
          .select({ id: users.id })
          .from(users)
          .where(peopleOf(tx, subject))
          .orderBy(asc(users.id))
          .for("share");
        if (!(await subjectExists(tx, subject))) return null;
        const [inserted] = await tx
          .insert(holds)
          .values({
            subjectType: subject.kind,
            subjectId: subject.id,
            reason: valid.value.reason,
            endsAt: valid.value.endsAt,
            setBy: operatorUserId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (inserted === undefined) throw new Error("The hold was not saved.");
        // The reason stays with the hold: the log keeps IDs and dates only.
        await recordAudit(tx, {
          operator: { userId: operatorUserId, sessionId: null },
          action: "hold.set",
          subjectType: subject.kind,
          subjectId: subject.id,
          after: { hold: inserted.id, endsAt: inserted.endsAt.toISOString() },
          request: null,
        });
        return inserted;
      });
      if (row === null) return err({ code: "subject_not_found" });
      return ok(recordOf(row));
    },

    async end({ holdId, operatorUserId }) {
      const now = clock();
      if (!(await isOperator(db, operatorUserId))) {
        return err({ code: "not_an_operator" });
      }
      return db.transaction(async (tx): Promise<Result<HoldRecord, EndHoldError>> => {
        const [current] = await tx.select().from(holds).where(eq(holds.id, holdId)).for("update");
        if (current === undefined) return err({ code: "hold_not_found" });
        if (current.endedAt !== null || current.endsAt <= now) {
          return err({ code: "hold_already_ended" });
        }
        const [ended] = await tx
          .update(holds)
          .set({ endedAt: now, updatedAt: now })
          .where(eq(holds.id, holdId))
          .returning();
        if (ended === undefined) throw new Error("The hold was not ended.");
        await recordAudit(tx, {
          operator: { userId: operatorUserId, sessionId: null },
          action: "hold.ended",
          subjectType: current.subjectType,
          subjectId: current.subjectId,
          before: { endedAt: null },
          after: { hold: holdId, endedAt: now.toISOString() },
          request: null,
        });
        return ok(recordOf(ended));
      });
    },

    async inForce() {
      const rows = await db
        .select()
        .from(holds)
        .where(inForce(clock()))
        .orderBy(asc(holds.endsAt), asc(holds.createdAt));
      return rows.map(recordOf);
    },
  };
}
