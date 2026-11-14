import { carColours } from "@shareride/domain";
import { z } from "zod";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

/** One of my cars (spec 3, 3.2). Only I see the number plate for now. */
export const vehicleSchema = z.object({
  id: z.uuid(),
  make: z.string(),
  model: z.string(),
  colour: z.enum(carColours),
  /** Capitals without spaces or hyphens; null until I add it. */
  registration: z.string().nullable(),
});

export type Vehicle = z.infer<typeof vehicleSchema>;

/** The rules are in spec 3, section 3.2; the server tidies the plate. */
export const vehicleBodySchema = z.object({
  make: z.string().max(100),
  model: z.string().max(100),
  colour: z.string().max(20),
  registration: z.string().max(20).nullable(),
});

export const vehiclesResponseSchema = z.object({ vehicles: z.array(vehicleSchema) });

/** What a driver still needs before publishing (spec 3, 3.1 and rule R3.1). */
export const driverReadinessSchema = z.object({
  ready: z.boolean(),
  items: z.array(
    z.object({
      item: z.enum(["photo", "car", "licence"]),
      done: z.boolean(),
      /** False for the photo until photos can be added (milestone 3, decision 2). */
      blocking: z.boolean(),
    }),
  ),
  licenceDeclaredAt: timestampSchema.nullable(),
});

export type DriverReadiness = z.infer<typeof driverReadinessSchema>;

const errors = { schema: errorResponseSchema } as const;
const unauthenticated = { description: "unauthenticated", ...errors } as const;
const invalid = { description: "vehicle_invalid, with the field in details", ...errors } as const;
const notFound = { description: "not_found: no such car of mine", ...errors } as const;

export const driverReadinessRoute = defineRoute({
  method: "get",
  path: "/v1/me/driver-readiness",
  summary: "What I still need before publishing a trip",
  tags: ["driving"],
  auth: true,
  responses: {
    200: { description: "The checklist", schema: driverReadinessSchema },
    401: unauthenticated,
  },
});

export const declareLicenceRoute = defineRoute({
  method: "put",
  path: "/v1/me/driver-licence-declaration",
  summary: "Declare that I hold a valid driving licence",
  tags: ["driving"],
  auth: true,
  request: { body: z.object({ declared: z.literal(true) }) },
  responses: {
    200: { description: "The checklist after declaring", schema: driverReadinessSchema },
    401: unauthenticated,
  },
});

export const listVehiclesRoute = defineRoute({
  method: "get",
  path: "/v1/me/vehicles",
  summary: "My cars",
  tags: ["driving"],
  auth: true,
  responses: {
    200: { description: "Cars I have not removed, oldest first", schema: vehiclesResponseSchema },
    401: unauthenticated,
  },
});

export const addVehicleRoute = defineRoute({
  method: "post",
  path: "/v1/me/vehicles",
  summary: "Add a car",
  tags: ["driving"],
  auth: true,
  request: { body: vehicleBodySchema },
  responses: {
    201: { description: "The car", schema: vehicleSchema },
    400: invalid,
    401: unauthenticated,
  },
});

export const updateVehicleRoute = defineRoute({
  method: "patch",
  path: "/v1/me/vehicles/{id}",
  summary: "Change a car, for example to add its number plate",
  tags: ["driving"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }), body: vehicleBodySchema },
  responses: {
    200: { description: "The car after the change", schema: vehicleSchema },
    400: invalid,
    401: unauthenticated,
    404: notFound,
  },
});

export const removeVehicleRoute = defineRoute({
  method: "delete",
  path: "/v1/me/vehicles/{id}",
  summary: "Remove a car; it stays on past trips",
  tags: ["driving"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    204: { description: "Removed" },
    401: unauthenticated,
    404: notFound,
  },
});
