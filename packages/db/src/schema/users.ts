import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { inviteCodes } from "./beta.ts";
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
    /** When ShareRide hid About you from others (spec 9, 3.4.3); a new text is shown again. */
    aboutHiddenAt: at(),
    /**
     * Where the profile photo's file is in photo storage (ADR 0033): a
     * random key, new for each photo; empty for none.
     */
    photoKey: text().unique("users_photo_key_unique"),
    /** When ShareRide hid the photo from others (spec 9, 3.4.3); a new photo is shown again. */
    photoHiddenAt: at(),
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
    /** The end of a suspension (spec 9, 3.6); empty while suspended means for good. */
    suspendedUntil: at(),
    /**
     * The invite code the account was made with (spec 12, 3.2.3); empty for
     * accounts made while no code was needed. An account with one is a
     * tester, counted against `beta_max_testers` (R12.3).
     */
    inviteCodeId: uuid().references(() => inviteCodes.id),
    ...timestamps,
  },
  (table) => [
    // Counting the testers, and the accounts of one code.
    index("users_invite_code_id_index").on(table.inviteCodeId),
    check("users_locale_check", sql`${table.locale} in ('is', 'en')`),
    // "deleted" is the former member's alone (formerMemberId).
    check("users_status_check", sql`${table.status} in ('active', 'suspended', 'deleted')`),
    check(
      "users_photo_hidden_at_check",
      sql`${table.photoHiddenAt} is null or ${table.photoKey} is not null`,
    ),
    check(
      "users_suspended_until_check",
      sql`${table.suspendedUntil} is null or ${table.status} = 'suspended'`,
    ),
  ],
);

/**
 * Files in photo storage that nobody has any more (ADR 0033): a photo
 * replaced or removed, an erased account's photo, or an upload not yet
 * saved, whose `deleteAfter` lies a little ahead. The API deletes each file
 * once its time has come, and the row with it, trying again every minute.
 */
export const photoFilesToDelete = pgTable("photo_files_to_delete", {
  key: text().primaryKey(),
  deleteAfter: at().notNull(),
  createdAt: at().notNull().defaultNow(),
});
