import { schema } from "@shareride/db";
import { canUseConsole, newMembersFrom, newMembersPeriod } from "@shareride/domain";
import { and, desc, eq, gt, isNotNull, lt, lte, ne, sql } from "drizzle-orm";
import type { Queryable, Transaction } from "../bookings/seats.ts";

// The operator's email about new members (spec 25): who counts, and the
// period each email covers. The email names nobody (R25.4), so nothing here
// reads more than counts and times.

const { notificationPreferences, notifications, users } = schema;

/** A member who finished signing up and was not deleted since (R25.2). */
const member = and(isNotNull(users.ageConfirmedAt), ne(users.status, "deleted"));

/** Members who finished signing up after `from`, up to and with `until`. */
export async function membersJoined(q: Queryable, from: Date, until: Date): Promise<number> {
  const [row] = await q
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(member, gt(users.ageConfirmedAt, from), lte(users.ageConfirmedAt, until)));
  return row?.count ?? 0;
}

/** Every member who had finished signing up by `until`. */
export async function membersInAll(q: Queryable, until: Date): Promise<number> {
  const [row] = await q
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(member, lte(users.ageConfirmedAt, until)));
  return row?.count ?? 0;
}

/** When the operator turned the email on, or null while it is off (R25.1). */
export async function newMembersSinceOf(q: Queryable, userId: string): Promise<Date | null> {
  const [row] = await q
    .select({ since: notificationPreferences.newMembersSince })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  return row?.since ?? null;
}

/** When the operator's last email about new members before `before` was made, if any. */
export async function lastNewMembersEmailAt(
  q: Queryable,
  userId: string,
  before?: Date,
): Promise<Date | null> {
  const [row] = await q
    .select({ at: notifications.createdAt })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, userId),
        eq(notifications.kind, "new_members"),
        before === undefined ? undefined : lt(notifications.createdAt, before),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  return row?.at ?? null;
}

/**
 * What one email about new members says, as it is sent: those who joined
 * from the later of turning it on and the operator's previous email
 * (`newMembersFrom`), to the moment this one was made (R25.3), and the
 * members by then. Null once the email is off, or was turned on again
 * after this one was made: it no longer applies.
 */
export async function newMembersFactsOf(
  q: Queryable,
  notification: { readonly recipientId: string; readonly createdAt: Date },
): Promise<{ readonly count: number; readonly since: Date; readonly total: number } | null> {
  const { recipientId, createdAt: until } = notification;
  const onSince = await newMembersSinceOf(q, recipientId);
  if (onSince === null || onSince > until) return null;
  const lastEmailAt = await lastNewMembersEmailAt(q, recipientId, until);
  const since = newMembersFrom({ onSince, lastEmailAt, until });
  return {
    count: await membersJoined(q, since, until),
    since,
    total: await membersInAll(q, until),
  };
}

/**
 * Turns the operator's email about new members on or off (R25.1). Turned on
 * again while on, it keeps counting from the first time; off, it forgets.
 */
export async function setNewMembersEmail(
  q: Queryable,
  userId: string,
  on: boolean,
  now: Date,
): Promise<Date | null> {
  const since = on ? ((await newMembersSinceOf(q, userId)) ?? now) : null;
  await q
    .insert(notificationPreferences)
    .values({ userId, newMembersSince: since, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { newMembersSince: since, updatedAt: now },
    });
  return since;
}

/** The operators who may use the console and have the email about new members on. */
export async function operatorsWantingNewMembers(
  q: Queryable,
): Promise<readonly { readonly userId: string; readonly since: Date }[]> {
  const rows = await q
    .select({
      userId: users.id,
      since: notificationPreferences.newMembersSince,
      roles: users.roles,
      status: users.status,
      deleteAfter: users.deleteAfter,
    })
    .from(notificationPreferences)
    .innerJoin(users, eq(users.id, notificationPreferences.userId))
    .where(isNotNull(notificationPreferences.newMembersSince));
  return rows.flatMap((row) =>
    row.since !== null && canUseConsole(row) ? [{ userId: row.userId, since: row.since }] : [],
  );
}

/**
 * Whether an email about new members is due to the operator now (R25.3):
 * the hour since their last one is over, and someone finished signing up
 * since. In a transaction that holds the operator's settings row, so two
 * workers running at once make one email.
 */
export async function newMembersEmailDue(
  tx: Transaction,
  userId: string,
  now: Date,
): Promise<boolean> {
  const [row] = await tx
    .select({ since: notificationPreferences.newMembersSince })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .for("update");
  const onSince = row?.since ?? null;
  if (onSince === null) return false;
  const period = newMembersPeriod({
    onSince,
    lastEmailAt: await lastNewMembersEmailAt(tx, userId),
    now,
  });
  return period !== null && (await membersJoined(tx, period.from, now)) > 0;
}
