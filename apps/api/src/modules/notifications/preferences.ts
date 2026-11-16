import { schema, type Database } from "@shareride/db";
import { eq } from "drizzle-orm";
import type { Queryable } from "../bookings/seats.ts";

// What a person turned off (spec 7, 3.6, item 1; R7.8). No row means the
// defaults: trip reminders on.

const { notificationPreferences } = schema;

export interface NotificationPreferences {
  readonly reminders: boolean;
}

export async function preferencesOf(
  q: Queryable,
  userId: string,
): Promise<NotificationPreferences> {
  const [row] = await q
    .select({ reminders: notificationPreferences.reminders })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  return { reminders: row?.reminders ?? true };
}

export async function setPreferences(
  db: Database,
  userId: string,
  preferences: NotificationPreferences,
  now: Date,
): Promise<NotificationPreferences> {
  await db
    .insert(notificationPreferences)
    .values({ userId, reminders: preferences.reminders, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { reminders: preferences.reminders, updatedAt: now },
    });
  return preferencesOf(db, userId);
}
