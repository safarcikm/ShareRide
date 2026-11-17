// The rating on profiles (spec 8, 3.7.5; R8.9): the reviews anyone can read.
import type { Rating } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { ratingOf, type RatedReview } from "@shareride/domain";
import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Queryable } from "../bookings/seats.ts";

const { reviews, users } = schema;

/** A review's author, as they write it. */
export const authors = alias(users, "authors");

/**
 * The reviews about a person that may show, before the domain's own rule:
 * never one by someone leaving ShareRide, whose reviews disappear with them
 * until they are erased and shown as by a former member (spec 11, 3.4.3).
 */
export function aboutThem(userIds: readonly string[]): SQL | undefined {
  return and(inArray(reviews.subjectId, [...userIds]), isNull(authors.deleteAfter));
}

/** The rating of each of these people. */
export async function ratingsOf(
  q: Queryable,
  userIds: readonly string[],
): Promise<ReadonlyMap<string, Rating>> {
  const ids = [...new Set(userIds)];
  const rated = new Map<string, RatedReview[]>(ids.map((id) => [id, []]));
  if (ids.length > 0) {
    const rows = await q
      .select({
        subjectId: reviews.subjectId,
        rating: reviews.rating,
        revealedAt: reviews.revealedAt,
        hiddenAt: reviews.hiddenAt,
      })
      .from(reviews)
      .innerJoin(authors, eq(authors.id, reviews.authorId))
      .where(aboutThem(ids));
    for (const row of rows) {
      rated.get(row.subjectId)?.push({
        rating: row.rating,
        revealed: row.revealedAt !== null,
        hidden: row.hiddenAt !== null,
      });
    }
  }
  return new Map(ids.map((id) => [id, ratingOf(rated.get(id) ?? [])]));
}
