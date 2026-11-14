import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";
import { at, id, timestamps } from "./columns.ts";

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
    status: text().notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    check("users_locale_check", sql`${table.locale} in ('is', 'en')`),
    check("users_status_check", sql`${table.status} in ('active', 'suspended')`),
  ],
);
