// Public profiles (spec 1, 3.5; spec 8, 3.7 and 3.8): what anyone signed in
// sees about a person, reached by the person's profile reference. Nobody is
// shown who is leaving ShareRide, the former member, or someone who has not
// finished signing up.
import {
  profileReviewsPageSize,
  type ProfileReview,
  type PublicProfile,
} from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  err,
  icelandDate,
  ok,
  peopleColourOf,
  type ReliabilitySettings,
  type Result,
  type Role,
} from "@shareride/domain";
import { and, desc, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import { shown } from "../privacy/hidden.ts";
import { aboutThem, authors, ratingsOf, readable } from "./ratings.ts";
import { reliabilityOfPeople } from "./reliability.ts";

const { reviews, users } = schema;

export type PeopleError =
  | { readonly code: "not_found" }
  /** `before` is not one of the person's reviews. */
  | { readonly code: "before_unknown" };

export interface PeopleService {
  profile(profileId: string): Promise<Result<PublicProfile, PeopleError>>;
  /** The reviews the person was given, newest first, a page at a time, as `viewer` reads them. */
  reviews(
    profileId: string,
    query: { readonly role?: Role | undefined; readonly before?: string | undefined },
    viewer: string,
  ): Promise<Result<{ reviews: ProfileReview[]; more: boolean }, PeopleError>>;
}

const theOther = { driver: "passenger", passenger: "driver" } as const;

export function createPeopleService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings: ReliabilitySettings;
}): PeopleService {
  const { db, clock, settings } = dependencies;

  async function personOf(profileId: string) {
    const [person] = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        about: users.about,
        aboutHiddenAt: users.aboutHiddenAt,
        languages: users.languages,
        phoneVerifiedAt: users.phoneVerifiedAt,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.profileId, profileId), shown(users), isNotNull(users.firstName)));
    return person;
  }

  return {
    async profile(profileId) {
      const person = await personOf(profileId);
      if (person === undefined || person.firstName === null) return err({ code: "not_found" });
      const [rating, reliability] = await Promise.all([
        ratingsOf(db, [person.id]),
        reliabilityOfPeople(db, [person.id], clock(), settings),
      ]);
      const figure = reliability.get(person.id);
      if (figure === undefined) throw new Error("Each person asked for has a figure.");
      return ok({
        profileId,
        firstName: person.firstName,
        // About you that ShareRide hid is not shown until they write a new one
        // (spec 9, 3.4.3).
        about:
          person.about === null || person.about === "" || person.aboutHiddenAt !== null
            ? null
            : person.about,
        languages: [...person.languages],
        phoneVerified: person.phoneVerifiedAt !== null,
        emailVerified: person.emailVerifiedAt !== null,
        memberSince: icelandDate(person.createdAt).slice(0, 7),
        colour: peopleColourOf(person.id),
        rating: rating.get(person.id) ?? { average: null, count: 0 },
        reliability: {
          kept: figure.kept,
          counted: figure.counted,
          percent: figure.percent,
          byRole: figure.byRole,
        },
      });
    },

    async reviews(profileId, query, viewer) {
      const person = await personOf(profileId);
      if (person === undefined) return err({ code: "not_found" });
      const shownToAll = and(
        aboutThem([person.id]),
        readable(),
        query.role === undefined ? undefined : eq(reviews.authorRole, theOther[query.role]),
      );
      let after: SQL | undefined;
      if (query.before !== undefined) {
        // Any review about them marks the place, so a page goes on even when
        // the last one shown was hidden meanwhile; nothing of it is sent.
        const [last] = await db
          .select({ id: reviews.id })
          .from(reviews)
          .where(and(eq(reviews.id, query.before), eq(reviews.subjectId, person.id)));
        if (last === undefined) return err({ code: "before_unknown" });
        // Compared in the database, which keeps the microseconds.
        after = sql`(${reviews.createdAt}, ${reviews.id}) < (select created_at, id from reviews where id = ${last.id})`;
      }
      const rows = await db
        .select({
          id: reviews.id,
          rating: reviews.rating,
          comment: reviews.comment,
          authorRole: reviews.authorRole,
          createdAt: reviews.createdAt,
          authorId: reviews.authorId,
          firstName: authors.firstName,
        })
        .from(reviews)
        .innerJoin(authors, eq(authors.id, reviews.authorId))
        .where(and(shownToAll, after))
        .orderBy(desc(reviews.createdAt), desc(reviews.id))
        .limit(profileReviewsPageSize + 1);
      return ok({
        reviews: rows.slice(0, profileReviewsPageSize).map((row) => ({
          id: row.id,
          rating: row.rating,
          comment: row.comment,
          author: { firstName: row.firstName },
          authorRole: row.authorRole as Role,
          writtenIn: icelandDate(row.createdAt).slice(0, 7),
          mine: row.authorId === viewer,
        })),
        more: rows.length > profileReviewsPageSize,
      });
    },
  };
}
