import { schema, type Database } from "@shareride/db";
import { eq } from "drizzle-orm";
import type { Queryable } from "../bookings/seats.ts";

// What a person turned off (spec 7, 3.6, item 1; R7.8). No row means the
// defaults: trip reminders and beta news on.

const { notificationPreferences } = schema;

export interface NotificationPreferences {
  readonly reminders: boolean;
  /** The operator's announcements (spec 10, 3.5.4). */
  readonly betaNews: boolean;
}

export async function preferencesOf(
  q: Queryable,
  userId: string,
): Promise<NotificationPreferences> {
  const [row] = await q
    .select({
      reminders: notificationPreferences.reminders,
      betaNews: notificationPreferences.betaNews,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  return { reminders: row?.reminders ?? true, betaNews: row?.betaNews ?? true };
}

export async function setPreferences(
  db: Database,
  userId: string,
  changes: {
    readonly reminders?: boolean | undefined;
    readonly betaNews?: boolean | undefined;
  },
  now: Date,
): Promise<NotificationPreferences> {
  // Only what changes: what is left out keeps its value, or its default.
  const set = {
    ...(changes.reminders === undefined ? {} : { reminders: changes.reminders }),
    ...(changes.betaNews === undefined ? {} : { betaNews: changes.betaNews }),
  };
  await db
    .insert(notificationPreferences)
    .values({ userId, ...set, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { ...set, updatedAt: now },
    });
  return preferencesOf(db, userId);
}
