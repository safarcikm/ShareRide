import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  adminAddNoteRoute,
  adminDeclineRatesRoute,
  adminTripRoute,
  adminTripsRoute,
  adminUserRoute,
  adminUsersRoute,
} from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { consoleActorOf } from "./admin-routes.ts";
import type { PeopleConsoleService } from "./people.ts";

export interface PeopleAdminRoutesDependencies {
  readonly people: PeopleConsoleService;
  readonly requireOperator: MiddlewareHandler<AppEnv>;
  readonly clientAddress: (c: Context) => string;
}

/** The console's users, trips and decline rates under /admin/v1 (spec 9, 3.5 and 3.4.5). */
export function registerPeopleAdminRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: PeopleAdminRoutesDependencies,
): void {
  const { people, requireOperator, clientAddress } = dependencies;

  app.openapi(toOpenApiRoute(adminUsersRoute, requireOperator), async (c) => {
    const { q } = validated(c, "query", adminUsersRoute.request.query);
    return c.json({ users: [...(await people.users(q))] }, 200);
  });

  app.openapi(toOpenApiRoute(adminUserRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminUserRoute.request.params);
    const user = await people.user(id);
    if (user === undefined) return errorResponse(c, 404, "not_found", "There is no such person.");
    return c.json(user, 200);
  });

  app.openapi(toOpenApiRoute(adminAddNoteRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminAddNoteRoute.request.params);
    const { text } = validated(c, "json", adminAddNoteRoute.request.body);
    const added = await people.addNote(id, text, consoleActorOf(c, clientAddress));
    if (added.ok) return c.json({ note: added.value }, 201);
    const { code } = added.error;
    if (code === "not_found") return errorResponse(c, 404, code, "There is no such person.");
    return errorResponse(c, 400, "validation_failed", "The note cannot be saved.", {
      details: [{ path: "text", issue: code }],
    });
  });

  app.openapi(toOpenApiRoute(adminTripsRoute, requireOperator), async (c) => {
    const filters = validated(c, "query", adminTripsRoute.request.query);
    return c.json({ trips: [...(await people.trips(filters))] }, 200);
  });

  app.openapi(toOpenApiRoute(adminTripRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminTripRoute.request.params);
    const trip = await people.trip(id);
    if (trip === undefined) return errorResponse(c, 404, "not_found", "There is no such trip.");
    return c.json(trip, 200);
  });

  app.openapi(toOpenApiRoute(adminDeclineRatesRoute, requireOperator), async (c) => {
    return c.json({ drivers: [...(await people.declineRates())] }, 200);
  });
}
