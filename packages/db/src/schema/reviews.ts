import { reviewMaxLength } from "@shareride/domain";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { bookings } from "./bookings.ts";
import { at, id, oneOf, timestamps } from "./columns.ts";
import { formerMemberId, users } from "./users.ts";

/**
 * A rating and review after a completed booking (spec 8, 3.7; R8.8 and
 * R8.9): the passenger's of the driver, or the driver's of the passenger,
 * one each, never changed once sent (`created_at` is when). It shows from
 * `revealed_at`: once both have reviewed, or 14 days after completion. A
 * driver absence that stands, or a passenger found absent, deletes the
 * booking's reviews (3.4). `hidden_at` is the operator's, for a review that
 * breaks the community rules (spec 9). 3 years after the trip, when the
 * trip is made anonymous, a review keeps its stars, comment and dates for
 * the person it is about, but is by the former member, on no booking (A49).
 */
export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    /** Null once its trip is made anonymous; it is then by the former member. */
    bookingId: uuid().references(() => bookings.id, { onDelete: "cascade" }),
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    /** The other person on the booking: the driver, or the passenger. */
    subjectId: uuid()
      .notNull()
      .references(() => users.id),
    /** Whether the author rode as the driver or as the passenger. */
    authorRole: text().notNull(),
    rating: integer().notNull(),
    /** Optional; empty for none. */
    comment: text().notNull().default(""),
    revealedAt: at(),
    hiddenAt: at(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("reviews_booking_author_unique").on(table.bookingId, table.authorId),
    check("reviews_author_role_check", oneOf(table.authorRole, ["driver", "passenger"])),
    check("reviews_rating_check", sql`${table.rating} between 1 and 5`),
    check(
      "reviews_comment_check",
      sql`char_length(${table.comment}) <= ${sql.raw(String(reviewMaxLength))}`,
    ),
    check("reviews_people_check", sql`${table.authorId} <> ${table.subjectId}`),
    check(
      "reviews_ride_check",
      sql`${table.bookingId} is not null or ${table.authorId} = ${sql.raw(`'${formerMemberId}'`)}`,
    ),
    // A profile lists the reviews about a person that show, newest first (PR 7).
    index("reviews_subject_index").on(table.subjectId, table.revealedAt),
    index("reviews_author_index").on(table.authorId),
    // The minute job reveals those whose 14 days have passed.
    index("reviews_waiting_index")
      .on(table.bookingId)
      .where(sql`${table.revealedAt} is null`),
  ],
);
