import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  addVehicleRoute,
  declareLicenceRoute,
  driverReadinessRoute,
  listVehiclesRoute,
  removeVehicleRoute,
  updateVehicleRoute,
} from "@shareride/contracts";
import type { VehicleError } from "@shareride/domain";
import type { Context, MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { DrivingService } from "./service.ts";

const invalid = (c: Context, error: VehicleError) =>
  errorResponse(c, 400, error.code, "A field of the car is not valid.", {
    details: [{ path: error.field, issue: "invalid" }],
  });

const notFound = (c: Context) =>
  errorResponse(c, 404, "not_found", "There is no such car of yours.");

export function registerDrivingRoutes(
  app: OpenAPIHono<AppEnv>,
  driving: DrivingService,
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(driverReadinessRoute, requireAuth), async (c) =>
    c.json(await driving.readiness(authOf(c).userId), 200),
  );

  app.openapi(toOpenApiRoute(declareLicenceRoute, requireAuth), async (c) => {
    validated(c, "json", declareLicenceRoute.request.body);
    return c.json(await driving.declareLicence(authOf(c).userId), 200);
  });

  app.openapi(toOpenApiRoute(listVehiclesRoute, requireAuth), async (c) =>
    c.json({ vehicles: await driving.vehicles(authOf(c).userId) }, 200),
  );

  app.openapi(toOpenApiRoute(addVehicleRoute, requireAuth), async (c) => {
    const body = validated(c, "json", addVehicleRoute.request.body);
    const result = await driving.addVehicle(authOf(c).userId, body);
    return result.ok ? c.json(result.value, 201) : invalid(c, result.error);
  });

  app.openapi(toOpenApiRoute(updateVehicleRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", updateVehicleRoute.request.params);
    const body = validated(c, "json", updateVehicleRoute.request.body);
    const result = await driving.updateVehicle(authOf(c).userId, id, body);
    if (result.ok) return c.json(result.value, 200);
    return result.error.code === "not_found" ? notFound(c) : invalid(c, result.error);
  });

  app.openapi(toOpenApiRoute(removeVehicleRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", removeVehicleRoute.request.params);
    const removed = await driving.removeVehicle(authOf(c).userId, id);
    return removed ? c.body(null, 204) : notFound(c);
  });
}
