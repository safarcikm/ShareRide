import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { at, id, timestamps } from "./columns.ts";

/**
 * Invite codes of the closed beta (spec 12, 3.2; R12.1 to R12.3): a new
 * account needs one while the setting `invite_code_required` is on. A group
 * code is made by the operator for a workplace, school or club; personal
 * codes, emailed to the waitlist, come with milestone 12. A code is never
 * deleted, so an account's `invite_code_id` always leads somewhere.
 */
export const inviteCodes = pgTable(
  "invite_codes",
  {
    id: id(),
    /** 8 characters of the domain's `inviteCodeAlphabet`, upper case. */
    code: text().notNull().unique("invite_codes_code_unique"),
    kind: text().notNull().default("group"),
    /** The operator's name for it, such as the workplace. */
    name: text().notNull(),
    usesAllowed: integer().notNull(),
    /** Accounts made with it so far. */
    uses: integer().notNull().default(0),
    /** The code works until this moment. */
    expiresAt: at().notNull(),
    /** When the operator ended it early. */
    endedAt: at(),
    /**
     * The operator, without a foreign key, as in the audit log. Null for a
     * code made by the `invite` command or the development seed.
     */
    createdBy: uuid(),
    ...timestamps,
  },
  (table) => [
    check("invite_codes_kind_check", sql`${table.kind} in ('group', 'personal')`),
    check("invite_codes_name_check", sql`char_length(${table.name}) between 1 and 80`),
    check("invite_codes_uses_check", sql`${table.uses} between 0 and ${table.usesAllowed}`),
    check("invite_codes_uses_allowed_check", sql`${table.usesAllowed} >= 1`),
  ],
);
