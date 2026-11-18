import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  adminCorridorsRoute,
  adminCreateCorridorRoute,
  adminUpdateCorridorRoute,
  type AdminCorridor,
} from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { operatorOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { auditRequestOf } from "../admin/audit.ts";
import type { CorridorError, CorridorService, CorridorView } from "./corridors.ts";

export interface MetricsAdminRoutesDependencies {
  readonly corridors: CorridorService;
  readonly requireOperator: MiddlewareHandler<AppEnv>;
  readonly clientAddress: (c: Context) => string;
}

const shown = (corridor: CorridorView): AdminCorridor => ({
  ...corridor,
  places: [...corridor.places],
  updatedAt: corridor.updatedAt.toISOString(),
});

const problems: Record<
  CorridorError["code"],
  { readonly path: string; readonly issue: string; readonly message: string }
> = {
  name_missing: { path: "name", issue: "missing", message: "Give the corridor a name." },
  name_too_long: { path: "name", issue: "too_long", message: "The name is too long." },
  too_few_places: {
    path: "placeIds",
    issue: "too_few",
    message: "A corridor has at least 2 places.",
  },
  too_many_places: {
    path: "placeIds",
    issue: "too_many",
    message: "A corridor has at most 12 places.",
  },
  place_twice: { path: "placeIds", issue: "twice", message: "A place can be on it once." },
  place_unknown: { path: "placeIds", issue: "not_found", message: "There is no such place." },
};

/** The console's corridor routes under /admin/v1 (spec 10, 3.4.1 and section 6). */
export function registerMetricsAdminRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: MetricsAdminRoutesDependencies,
): void {
  const { corridors, requireOperator, clientAddress } = dependencies;

  const by = (c: Context<AppEnv>) => {
    const { userId, sessionId } = operatorOf(c);
    return { operator: { userId, sessionId }, request: auditRequestOf(c, clientAddress) };
  };

  const refused = (c: Context, code: CorridorError["code"]) => {
    const { path, issue, message } = problems[code];
    return errorResponse(c, 400, "validation_failed", message, { details: [{ path, issue }] });
  };

  app.openapi(toOpenApiRoute(adminCorridorsRoute, requireOperator), async (c) => {
    const overview = await corridors.overview();
    return c.json({ corridors: overview.corridors.map(shown), places: [...overview.places] }, 200);
  });

  app.openapi(toOpenApiRoute(adminCreateCorridorRoute, requireOperator), async (c) => {
    const body = validated(c, "json", adminCreateCorridorRoute.request.body);
    const made = await corridors.create(body, by(c));
    if (!made.ok) return refused(c, made.error.code);
    return c.json(shown(made.value), 201);
  });

  app.openapi(toOpenApiRoute(adminUpdateCorridorRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminUpdateCorridorRoute.request.params);
    const body = validated(c, "json", adminUpdateCorridorRoute.request.body);
    const changed = await corridors.update(id, body, by(c));
    if (!changed.ok) {
      return changed.error.code === "not_found"
        ? errorResponse(c, 404, "not_found", "There is no such corridor.")
        : refused(c, changed.error.code);
    }
    return c.json(shown(changed.value), 200);
  });
}
