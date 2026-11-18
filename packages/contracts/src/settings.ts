import { pausedParts, settingGroups, settingReasonMaxLength } from "@shareride/domain";
import { z } from "zod";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// The operator's settings (spec 10, 3.2 and section 6; ADR 0032): the
// console's Settings page, and the few values the apps read.

const errors = { schema: errorResponseSchema } as const;

export const configSchema = z.object({
  /** The seats a trip can offer and a booking can take, at most (rule S1). */
  maxSeats: z.int().min(1),
  /**
   * A passenger who cancels this many minutes or more before boarding is
   * refunded in full (rule M2), for a booking made now. A booking already
   * made says its own.
   */
  freeCancellationMinutes: z.int().min(0),
  /** With bookings, a departure moves at most this many minutes from when each was made (R6.4). */
  maxMoveMinutes: z.int().min(0),
  /** The reliability figure counts trips and bookings over this many months (spec 8, 3.8). */
  reliabilityMonths: z.int().min(1),
  /** Whether creating an account needs an invite code (spec 12, R12.1). */
  beta: z.boolean(),
  /** What is paused for a short while, for the app's banners (spec 10, 3.3). */
  paused: z.array(z.enum(pausedParts)),
});

export type Config = z.infer<typeof configSchema>;

export const configRoute = defineRoute({
  method: "get",
  path: "/v1/config",
  summary: "The operator's settings the apps need; cached for 5 minutes",
  tags: ["config"],
  responses: {
    200: { description: "The values as they are now", schema: configSchema },
  },
});

export const adminSettingSchema = z.object({
  key: z.string(),
  group: z.enum(settingGroups),
  /** A switch is 1 (on) or 0 (off). */
  kind: z.enum(["number", "switch"]),
  unit: z.string().nullable(),
  value: z.int(),
  default: z.int(),
  min: z.int(),
  max: z.int(),
  step: z.int(),
});

export type AdminSetting = z.infer<typeof adminSettingSchema>;

export const adminSettingsSchema = z.object({
  /** The settings version these values are; 0 is the defaults. */
  version: z.int().min(0),
  settings: z.array(adminSettingSchema),
});

export type AdminSettings = z.infer<typeof adminSettingsSchema>;

export const adminSettingsRoute = defineRoute({
  method: "get",
  path: "/admin/v1/settings",
  summary: "Every setting with its value, default and range",
  tags: ["admin", "settings"],
  auth: "operator",
  responses: {
    200: { description: "The settings, in the catalogue's order", schema: adminSettingsSchema },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

export const adminChangeSettingBodySchema = z.object({
  value: z.number(),
  /** Why, kept with the change; needed, up to 500 characters. */
  reason: z.string().max(settingReasonMaxLength * 4),
  /** The version the console loaded, so a change never lands on values it did not see. */
  version: z.int().min(0),
});

export const adminChangeSettingRoute = defineRoute({
  method: "patch",
  path: "/admin/v1/settings/{key}",
  summary: "Change one setting, with a reason",
  tags: ["admin", "settings"],
  auth: "operator",
  request: {
    params: z.object({ key: z.string().max(100) }),
    body: adminChangeSettingBodySchema,
  },
  responses: {
    200: { description: "The settings after the change", schema: adminSettingsSchema },
    400: {
      description:
        "validation_failed: a value out of its range or off its step, a suggested rate the largest car's cap cannot carry, or a reason missing or too long",
      ...errors,
    },
    401: { description: "operator_unauthenticated", ...errors },
    404: { description: "not_found: no such setting", ...errors },
    409: {
      description:
        "settings_changed: a setting was changed since the console loaded them; unchanged: it has this value already",
      ...errors,
    },
  },
});

const pricePreviewSchema = z.object({
  /** One seat for the whole example route at 100%, in krónur. */
  price: z.int(),
  /** The highest price level a driver offering the example's seats can choose, in percent. */
  highestLevel: z.int(),
});

export const adminSettingPreviewSchema = z.object({
  /**
   * For a price value: Reykjavík to Akureyri with 3 seats, as it is and as
   * it would be. Null for a setting whose effect the console says in words.
   */
  price: z
    .object({
      distanceKm: z.int(),
      seats: z.int(),
      before: pricePreviewSchema,
      after: pricePreviewSchema,
    })
    .nullable(),
});

export type AdminSettingPreview = z.infer<typeof adminSettingPreviewSchema>;

export const adminPreviewSettingRoute = defineRoute({
  method: "post",
  path: "/admin/v1/settings/{key}/preview",
  summary: "The effect of a new value, before it is saved; nothing changes",
  tags: ["admin", "settings"],
  auth: "operator",
  request: {
    params: z.object({ key: z.string().max(100) }),
    body: z.object({ value: z.number() }),
  },
  responses: {
    200: { description: "The effect", schema: adminSettingPreviewSchema },
    400: {
      description:
        "validation_failed: a value out of its range or off its step, or a suggested rate the largest car's cap cannot carry",
      ...errors,
    },
    401: { description: "operator_unauthenticated", ...errors },
    404: { description: "not_found: no such setting", ...errors },
    409: { description: "unchanged: it has this value already", ...errors },
  },
});

export const adminSettingChangeSchema = z.object({
  version: z.int().min(1),
  key: z.string(),
  oldValue: z.int(),
  newValue: z.int(),
  reason: z.string(),
  /** Who changed it; null for a change made by a command on the server. */
  changedBy: z.object({ userId: z.uuid(), firstName: z.string().nullable() }).nullable(),
  changedAt: timestampSchema,
});

export type AdminSettingChange = z.infer<typeof adminSettingChangeSchema>;

export const adminSettingsHistoryRoute = defineRoute({
  method: "get",
  path: "/admin/v1/settings/history",
  summary: "Every change of a setting, newest first, 50 a page",
  tags: ["admin", "settings"],
  auth: "operator",
  request: {
    query: z.object({
      /** Changes older than this version: the `next` of the page before. */
      before: z.coerce.number<number>().int().min(1).optional(),
    }),
  },
  responses: {
    200: {
      description: "A page of changes, and where the next one starts, or null at the end",
      schema: z.object({
        changes: z.array(adminSettingChangeSchema),
        next: z.int().nullable(),
      }),
    },
    401: { description: "operator_unauthenticated", ...errors },
  },
});
