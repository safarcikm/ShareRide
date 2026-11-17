import { sql } from "drizzle-orm";
import { check, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { at, id, timestamps } from "./columns.ts";

/**
 * The one anonymous "former member" (privacy plan, decision 2): what is kept
 * of an erased person's trips, bookings and payments moves to this row, so
 * nobody can link them to each other again. Made by the migration
 * `account_deletion`; it has no number, so it can never sign in.
 */
export const formerMemberId = "00000000-0000-4000-8000-000000000001";

/** People with an account (spec 1). Personal data: see the record of processing. */
export const users = pgTable(
  "users",
  {
    id: id(),
    /** E.164; one account per number (rule R1.1). */
    phoneE164: text("phone_e164").unique("users_phone_e164_unique"),
    phoneVerifiedAt: at(),
    firstName: text(),
    about: text(),
    /** ISO 639-1 codes of languages the person speaks. */
    languages: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** The app's language for this person: "is" or "en". */
    locale: text().notNull(),
    email: text().unique("users_email_unique"),
    emailVerifiedAt: at(),
    /** When the person confirmed they are 18 or older (rule R1.7); no birth date. */
    ageConfirmedAt: at(),
    /** When the driver declared a valid driving licence (spec 3, 3.3); nothing else about it. */
    licenceDeclaredAt: at(),
    roles: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    /**
     * Set while a deletion waits: the data is erased after it (spec 11,
     * 3.4.4). The status stays as it was, so undoing never lifts a suspension.
     */
    deleteAfter: at(),
    status: text().notNull().default("active"),
    /**
     * The person's public reference, for their profile (spec 1, 3.5; spec 8,
     * 3.7 and 3.8): random, so it cannot be guessed or linked to anything
     * else, and never the ID their account, trips and bookings use.
     */
    profileId: uuid().notNull().defaultRandom().unique("users_profile_id_unique"),
    ...timestamps,
  },
  (table) => [
    check("users_locale_check", sql`${table.locale} in ('is', 'en')`),
    // "deleted" is the former member's alone (formerMemberId).
    check("users_status_check", sql`${table.status} in ('active', 'suspended', 'deleted')`),
  ],
);
