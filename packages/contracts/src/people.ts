import { peopleColourCount } from "@shareride/domain";
import { z } from "zod";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// Public profiles (spec 1, 3.5; spec 8, 3.7 and 3.8): what anyone signed in
// sees about a person before travelling with them. A profile is reached by
// its own random reference, `profileId`, never the person's ID. Never the
// phone number, email or last name; reliability as counts only, never the
// reasons or notes behind them (spec 8, section 7).

const errors = { schema: errorResponseSchema } as const;

/** Whether a person rode as the driver or as a passenger. */
export const roleSchema = z.enum(["driver", "passenger"]);

const countsSchema = z.object({ kept: z.int().nonnegative(), counted: z.int().nonnegative() });

/** The reliability figure and the counts behind it, over the last 12 months (R8.10). */
export const reliabilitySchema = countsSchema.extend({
  /** Kept out of counted, rounded down; null until 5 count ("Not enough trips yet"). */
  percent: z.int().min(0).max(100).nullable(),
  byRole: z.object({ driver: countsSchema, passenger: countsSchema }),
});

export type ReliabilityFigure = z.infer<typeof reliabilitySchema>;

/** The average of the reviews anyone can read, to one decimal, and how many (3.7.5). */
export const ratingSchema = z.object({
  average: z.number().min(1).max(5).nullable(),
  count: z.int().nonnegative(),
});

export type Rating = z.infer<typeof ratingSchema>;

/**
 * How a person stands, beside their name on a trip, a request or a booking
 * (spec 4, 3.6.3; spec 5, 3.3.2): their rating, and the reliability figure's
 * share kept, null until 5 count. The counts behind it are on the profile.
 */
export const standingSchema = z.object({
  rating: ratingSchema,
  reliabilityPercent: z.int().min(0).max(100).nullable(),
});

export type Standing = z.infer<typeof standingSchema>;

/** A person's colour, from their ID (spec 15): the same everywhere they appear. */
export const peopleColourSchema = z
  .int()
  .min(0)
  .max(peopleColourCount - 1);

/** A year and month, such as 2026-11, in Iceland. */
export const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const publicProfileSchema = z.object({
  profileId: z.uuid(),
  firstName: z.string(),
  /** Null when empty. */
  about: z.string().nullable(),
  /** ISO 639-1 codes. */
  languages: z.array(z.string()),
  /** Badges (spec 1, 3.5). */
  phoneVerified: z.boolean(),
  emailVerified: z.boolean(),
  /** The year and month they joined. */
  memberSince: yearMonthSchema,
  colour: peopleColourSchema,
  rating: ratingSchema,
  reliability: reliabilitySchema,
});

export type PublicProfile = z.infer<typeof publicProfileSchema>;

/** A review on a profile (3.7.5): never one not yet revealed, or hidden by ShareRide. */
export const profileReviewSchema = z.object({
  id: z.uuid(),
  rating: z.int().min(1).max(5),
  /** Empty for none. */
  comment: z.string(),
  /** The author's first name; null for a former member. */
  author: z.object({ firstName: z.string().nullable() }),
  /** How the author travelled: as the driver, reviewing a passenger, or as a passenger. */
  authorRole: roleSchema,
  /** The month it was written. */
  writtenIn: yearMonthSchema,
});

export type ProfileReview = z.infer<typeof profileReviewSchema>;

/** Reviews on a page of a profile. */
export const profileReviewsPageSize = 20;

const profileParams = z.object({ profileId: z.uuid() });

const notFound = {
  description:
    "not_found: no such profile, or the person has left ShareRide or is leaving (spec 11)",
  ...errors,
} as const;

export const publicProfileRoute = defineRoute({
  method: "get",
  path: "/v1/people/{profileId}",
  summary: "A person's public profile, with the rating and the reliability figure",
  tags: ["people"],
  auth: true,
  request: { params: profileParams },
  responses: {
    200: { description: "The profile", schema: publicProfileSchema },
    400: { description: "validation_failed: `profileId` is not a UUID", ...errors },
    401: { description: "unauthenticated", ...errors },
    404: notFound,
  },
});

export const profileReviewsRoute = defineRoute({
  method: "get",
  path: "/v1/people/{profileId}/reviews",
  summary: "The reviews a person was given, newest first",
  tags: ["people"],
  auth: true,
  request: {
    params: profileParams,
    query: z.object({
      /** Only the reviews they were given as a driver, or as a passenger. */
      role: roleSchema.optional(),
      /** The oldest review of the last page: the page after it. */
      before: z.uuid().optional(),
    }),
  },
  responses: {
    200: {
      description: `Up to ${String(profileReviewsPageSize)} reviews; \`more\` when there are older ones`,
      schema: z.object({ reviews: z.array(profileReviewSchema), more: z.boolean() }),
    },
    400: {
      description: "validation_failed: an unknown role, or `before` is not one of their reviews",
      ...errors,
    },
    401: { description: "unauthenticated", ...errors },
    404: notFound,
  },
});
