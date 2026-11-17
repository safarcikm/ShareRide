import {
  bookingModes,
  bookingStatuses,
  carColours,
  declineReasons,
  tripStatuses,
} from "@shareride/domain";
import { z } from "zod";
import {
  adminModerationActionSchema,
  adminPersonSchema,
  adminReportListItemSchema,
  adminStopSchema,
} from "./admin-reports.ts";
import { moneySchema, timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { localisedTextSchema } from "./meeting-points.ts";
import { defineRoute } from "./route.ts";

// The console's users, trips and bookings (spec 9, 3.5; milestone 9, PR 8):
// search, a person's page with everything ShareRide holds on them that the
// operator needs, a trip's page with its bookings, notes operators write
// about a person, and each driver's request decline rate (3.4.5). Suspending
// and reinstating use the moderation routes. Only operators reach these
// routes; the person gets the notes about them in Download my data (A48).

/** The most people or trips one search lists; `more` says when there were more. */
export const adminSearchShown = 50;

const errors = { schema: errorResponseSchema } as const;
const unauthenticated = { description: "operator_unauthenticated", ...errors } as const;

/** A person found by the console's search (3.5.1). */
export const adminUserListItemSchema = z.object({
  person: adminPersonSchema,
  /** E.164; null once they have none. */
  phone: z.string().nullable(),
  email: z.string().nullable(),
  joinedAt: timestampSchema,
});

export type AdminUserListItem = z.infer<typeof adminUserListItemSchema>;

/**
 * A note an operator wrote about a person (3.5.3). Only operators see it in
 * the console; the person gets its text and date in Download my data, never
 * who wrote it (A48).
 */
export const adminOperatorNoteSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  /** The operator who wrote it; the former member once their account is erased. */
  by: adminPersonSchema.nullable(),
  at: timestampSchema,
});

export type AdminOperatorNote = z.infer<typeof adminOperatorNoteSchema>;

/** How often a driver declined the requests they answered in the last 90 days (3.4.5). */
export const adminDeclinesSchema = z.object({
  answered: z.int().nonnegative(),
  declined: z.int().nonnegative(),
  /** By the reason the driver picked, seen only by the operator (R5.7); `none` when they gave none. */
  reasons: z.object(
    Object.fromEntries([...declineReasons, "none"].map((key) => [key, z.int().nonnegative()])) as {
      [Key in (typeof declineReasons)[number] | "none"]: z.ZodInt;
    },
  ),
});

export type AdminDeclines = z.infer<typeof adminDeclinesSchema>;

export const adminDeclineRateSchema = adminDeclinesSchema.extend({ driver: adminPersonSchema });

export type AdminDeclineRate = z.infer<typeof adminDeclineRateSchema>;

/** A trip as a list shows it. */
export const adminTripListItemSchema = z.object({
  id: z.uuid(),
  driver: adminPersonSchema,
  status: z.enum(tripStatuses),
  /** Its whole route: the first and last stops still on it. */
  from: adminStopSchema,
  to: adminStopSchema,
  /** Null for a draft without times. */
  departsAt: timestampSchema.nullable(),
  capacity: z.int().positive(),
  /** Seats held on its busiest segment: requested, accepted or paid (rule S1). */
  seatsHeld: z.int().nonnegative(),
});

export type AdminTripListItem = z.infer<typeof adminTripListItemSchema>;

/** A booking or request as the console shows it. */
const bookingShape = {
  id: z.uuid(),
  status: z.enum(bookingStatuses),
  seats: z.int().positive(),
  /** The passenger's own part of the trip. */
  from: adminStopSchema,
  to: adminStopSchema,
  totalPrice: moneySchema,
  /** Null for an instant booking. */
  requestedAt: timestampSchema.nullable(),
  /** Seen only by the operator (R5.7). */
  declineReason: z.enum(declineReasons).nullable(),
};

/** One of a person's bookings, latest departure first. */
export const adminUserBookingSchema = z.object({
  ...bookingShape,
  tripId: z.uuid(),
  driver: adminPersonSchema,
  /** The trip's departure. */
  departsAt: timestampSchema.nullable(),
});

export type AdminUserBooking = z.infer<typeof adminUserBookingSchema>;

const carSchema = z.object({
  make: z.string(),
  model: z.string(),
  colour: z.enum(carColours),
  registration: z.string().nullable(),
});

/** A person's page (3.5.2). Ratings and reliability come with milestone 7's profiles. */
export const adminUserSchema = adminUserListItemSchema.extend({
  phoneVerifiedAt: timestampSchema.nullable(),
  emailVerifiedAt: timestampSchema.nullable(),
  ageConfirmedAt: timestampSchema.nullable(),
  licenceDeclaredAt: timestampSchema.nullable(),
  /** ISO 639-1 codes. */
  languages: z.array(z.string()),
  /** Their About you; null for none. */
  about: z.object({ text: z.string(), hidden: z.boolean() }).nullable(),
  /** While they wait for their account to be deleted (spec 11). */
  deleteAfter: timestampSchema.nullable(),
  vehicles: z.array(carSchema.extend({ id: z.uuid(), removed: z.boolean() })),
  /** Trips they drive, drafts left out, latest departure first, at most 20. */
  trips: z.array(adminTripListItemSchema),
  /** Their bookings and requests, latest departure first, at most 20. */
  bookings: z.array(adminUserBookingSchema),
  /** Reports they filed, latest first, at most 20. */
  reportsBy: z.array(adminReportListItemSchema),
  /** Reports about them, latest first, at most 20. */
  reportsAbout: z.array(adminReportListItemSchema),
  /** Warnings, suspensions and every other action on them, latest first, at most 20. */
  actions: z.array(adminModerationActionSchema),
  /** Every note, latest first. */
  notes: z.array(adminOperatorNoteSchema),
  /** Null when they answered no request in the last 90 days. */
  declines: adminDeclinesSchema.nullable(),
});

export type AdminUser = z.infer<typeof adminUserSchema>;

/** A trip's page (3.5.2): its stops, car and every booking and request on it. */
export const adminTripSchema = adminTripListItemSchema.extend({
  stops: z.array(
    z.object({
      name: localisedTextSchema,
      plannedAt: timestampSchema.nullable(),
      removed: z.boolean(),
    }),
  ),
  vehicle: carSchema.nullable(),
  bookingMode: z.enum(bookingModes),
  /** Shown to passengers; empty for none. */
  note: z.string(),
  noteHidden: z.boolean(),
  cancelledAt: timestampSchema.nullable(),
  cancelledBy: z.enum(["driver", "operator"]).nullable(),
  /** Every booking and request, the earliest first. */
  bookings: z.array(z.object({ ...bookingShape, passenger: adminPersonSchema })),
});

export type AdminTrip = z.infer<typeof adminTripSchema>;

export const adminAddNoteBodySchema = z.object({
  /** Up to 1 000 characters as chat counts them; not empty. */
  text: z.string().max(4000),
});

export type AdminAddNoteBody = z.infer<typeof adminAddNoteBodySchema>;

export const adminFindUsersBodySchema = z.object({
  /** An ID, an email, a phone number (Icelandic without +354) or part of a first name. */
  q: z.string().trim().min(1).max(200),
});

export type AdminFindUsersBody = z.infer<typeof adminFindUsersBodySchema>;

/**
 * A POST, so a phone number or an email searched for stays out of addresses,
 * logs and browser history (privacy register: no personal data in URLs).
 */
export const adminFindUsersRoute = defineRoute({
  method: "post",
  path: "/admin/v1/users/search",
  summary: "Find people by first name, phone number, email or ID (3.5.1)",
  tags: ["admin", "users"],
  auth: "operator",
  request: { body: adminFindUsersBodySchema },
  responses: {
    200: {
      description: `The people found, by first name, at most ${String(adminSearchShown)}; \`more\` when there were more`,
      schema: z.object({ users: z.array(adminUserListItemSchema), more: z.boolean() }),
    },
    400: { description: "validation_failed: nothing to search for (`q`)", ...errors },
    401: unauthenticated,
  },
});

export const adminUserRoute = defineRoute({
  method: "get",
  path: "/admin/v1/users/{id}",
  summary: "A person's page: profile, cars, trips, bookings, reports, actions and notes (3.5.2)",
  tags: ["admin", "users"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: { description: "The person", schema: adminUserSchema },
    401: unauthenticated,
    404: { description: "not_found", ...errors },
  },
});

export const adminAddNoteRoute = defineRoute({
  method: "post",
  path: "/admin/v1/users/{id}/notes",
  summary: "Add a note about a person (3.5.3); they get it in Download my data, never who wrote it",
  tags: ["admin", "users"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }), body: adminAddNoteBodySchema },
  responses: {
    201: { description: "The note", schema: z.object({ note: adminOperatorNoteSchema }) },
    400: {
      description:
        "validation_failed: the note is empty or over 1 000 characters (`text`, `note_missing` or `too_long`)",
      ...errors,
    },
    401: unauthenticated,
    404: { description: "not_found", ...errors },
  },
});

export const adminTripsRoute = defineRoute({
  method: "get",
  path: "/admin/v1/trips",
  summary: "Find trips by departure day, place, driver, or a trip's or booking's ID (3.5.1)",
  tags: ["admin", "trips"],
  auth: "operator",
  request: {
    query: z.object({
      /** The day it departs, in Iceland. */
      date: z.iso.date().optional(),
      /** Part of a stop's name, in Icelandic or English. */
      place: z.string().trim().min(1).max(200).optional(),
      driverId: z.uuid().optional(),
      /** A trip's ID, or a booking's, which finds its trip. */
      id: z.uuid().optional(),
    }),
  },
  responses: {
    200: {
      description: `The trips found, the latest departure first; with no filter, those from today on, the soonest first. At most ${String(adminSearchShown)}; \`more\` when there were more`,
      schema: z.object({ trips: z.array(adminTripListItemSchema), more: z.boolean() }),
    },
    400: { description: "validation_failed: a filter is not valid", ...errors },
    401: unauthenticated,
  },
});

export const adminTripRoute = defineRoute({
  method: "get",
  path: "/admin/v1/trips/{id}",
  summary: "A trip with its stops, car, and every booking and request on it (3.5.2)",
  tags: ["admin", "trips"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: { description: "The trip", schema: adminTripSchema },
    401: unauthenticated,
    404: { description: "not_found", ...errors },
  },
});

export const adminDeclineRatesRoute = defineRoute({
  method: "get",
  path: "/admin/v1/decline-rates",
  summary: "Each driver's request decline rate in the last 90 days, the highest first (3.4.5)",
  tags: ["admin", "users"],
  auth: "operator",
  responses: {
    200: {
      description: "Every driver who answered a request, the highest share of declines first",
      schema: z.object({ drivers: z.array(adminDeclineRateSchema) }),
    },
    401: unauthenticated,
  },
});
