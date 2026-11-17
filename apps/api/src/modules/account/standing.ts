import { schema } from "@shareride/db";
import { checkActive, ok, type AccountSuspended, type Result } from "@shareride/domain";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { errorResponse } from "../../errors.ts";
import type { Queryable, Transaction } from "../bookings/seats.ts";

// What a suspended account can no longer do (spec 9, 3.6.2; R9.10):
// search, book, request, post or change a trip, send a message or review.
// Reading their own data, reporting, blocking and appealing stay open.

const { users } = schema;

async function standing(q: Queryable, userId: string, now: Date, lock: boolean) {
  const query = q
    .select({ status: users.status, suspendedUntil: users.suspendedUntil })
    .from(users)
    .where(eq(users.id, userId));
  const [row] = lock ? await query.for("update") : await query;
  // Gone with the account: whatever the caller looks for next is gone too.
  if (row === undefined) return ok(undefined);
  return checkActive(
    {
      status: row.status === "suspended" ? "suspended" : "active",
      suspendedUntil: row.suspendedUntil,
    },
    now,
  );
}

/**
 * Locks the person's row, as booking, publishing, changing a trip and
 * sending do to take one at a time, and refuses them while suspended. A
 * suspension locks the row too, so what it cancels cannot be added to
 * while it runs.
 */
export function lockActive(
  tx: Transaction,
  userId: string,
  now: Date,
): Promise<Result<void, AccountSuspended>> {
  return standing(tx, userId, now, true);
}

/** Refuses a suspended person, without a lock: for searching. */
export function checkStanding(
  q: Queryable,
  userId: string,
  now: Date,
): Promise<Result<void, AccountSuspended>> {
  return standing(q, userId, now, false);
}

/** 403 `account_suspended`, with the suspension's end (none for good). */
export function accountSuspended(c: Context, error: AccountSuspended) {
  return errorResponse(c, 403, "account_suspended", "This account is suspended.", {
    suspendedUntil: error.until === null ? null : error.until.toISOString(),
  });
}
