import { feedbackKinds, feedbackPlatforms, feedbackStatuses } from "@shareride/domain";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { at, bytes, id, oneOf, timestamps } from "./columns.ts";
import { users } from "./users.ts";

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

/**
 * Feedback from a tester (spec 12, 3.3; R12.5): their message and the
 * app's technical details, with the operator's status and one reply. Seen
 * by the operator only. Deleted with the account, and 12 months after the
 * beta ends.
 */
export const feedback = pgTable(
  "feedback",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    message: text().notNull(),
    appVersion: text().notNull(),
    platform: text().notNull(),
    /** Empty from a browser. */
    osVersion: text().notNull(),
    /** The screen's route, such as `/trips/[id]`: never an address with an ID in it. */
    screen: text().notNull(),
    /** The language the person used the app in. */
    language: text().notNull(),
    status: text().notNull().default("new"),
    reply: text(),
    repliedAt: at(),
    ...timestamps,
  },
  (table) => [
    index("feedback_user_index").on(table.userId, table.createdAt),
    // The console's list: newest first.
    index("feedback_created_index").on(table.createdAt),
    check("feedback_kind_check", oneOf(table.kind, feedbackKinds)),
    check("feedback_platform_check", oneOf(table.platform, feedbackPlatforms)),
    check("feedback_status_check", oneOf(table.status, feedbackStatuses)),
    check("feedback_language_check", sql`${table.language} in ('is', 'en')`),
    check("feedback_message_check", sql`char_length(${table.message}) between 1 and 2000`),
    check("feedback_reply_check", sql`char_length(${table.reply}) between 1 and 1000`),
    check("feedback_replied_check", sql`(${table.repliedAt} is null) = (${table.reply} is null)`),
  ],
);

/**
 * The screenshot sent with a feedback (spec 12, 3.3.2): a JPEG without
 * metadata, of at most 1 MB, in the database (milestone 11, choice 2).
 * Apart from the feedback, so a list never loads pictures.
 */
export const feedbackScreenshots = pgTable(
  "feedback_screenshots",
  {
    feedbackId: uuid()
      .primaryKey()
      .references(() => feedback.id, { onDelete: "cascade" }),
    file: bytes().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    createdAt: at().notNull().defaultNow(),
  },
  (table) => [
    check("feedback_screenshots_size_check", sql`octet_length(${table.file}) <= 1048576`),
  ],
);
