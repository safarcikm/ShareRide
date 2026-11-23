import { schema } from "@shareride/db";
import { and, desc, eq, gt, isNotNull, lt, lte, ne, sql } from "drizzle-orm";
import type { Queryable } from "../bookings/seats.ts";

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
 * from the later of turning it on and the operator's previous email, to the
 * moment this one was made (R25.3), and the members by then. Null once the
 * email is off, or was turned on again after this one was made: it no
 * longer applies.
 */
export async function newMembersFactsOf(
  q: Queryable,
  notification: { readonly recipientId: string; readonly createdAt: Date },
): Promise<{ readonly count: number; readonly since: Date; readonly total: number } | null> {
  const { recipientId, createdAt: until } = notification;
  const onSince = await newMembersSinceOf(q, recipientId);
  if (onSince === null || onSince > until) return null;
  const previous = await lastNewMembersEmailAt(q, recipientId, until);
  const since = previous !== null && previous > onSince ? previous : onSince;
  return {
    count: await membersJoined(q, since, until),
    since,
    total: await membersInAll(q, until),
  };
}
