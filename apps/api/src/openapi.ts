import { createRoute, type RouteConfig } from "@hono/zod-openapi";
import type { RouteDefinition } from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import type { z } from "zod";
import { adminPrefix, openAdminRoutes } from "./modules/admin/require-operator.ts";

const json = "application/json";

/** The OpenAPI name of the bearer token scheme used by routes marked `auth`. */
export const bearerAuth = "bearerAuth";

/** The OpenAPI name of the console's session cookie, for routes marked `auth: "operator"`. */
export const operatorSession = "operatorSession";

/**
 * Turns a framework-free contract route into a documented Hono route. Routes
 * marked `auth` get `auth` (requireAuth) and are documented as needing a
 * token; routes marked `auth: "optional"` get `auth` (optionalAuth) and are
 * documented as taking one; routes marked `auth: "operator"` get `auth`
 * (requireOperator) and are documented as needing the console's cookie.
 */
export function toOpenApiRoute(route: RouteDefinition, auth?: MiddlewareHandler): RouteConfig {
  const responses: RouteConfig["responses"] = {};
  for (const [status, response] of Object.entries(route.responses)) {
    responses[status] =
      response.schema === undefined
        ? { description: response.description }
        : { description: response.description, content: { [json]: { schema: response.schema } } };
  }
  const request: NonNullable<RouteConfig["request"]> = {};
  if (route.request?.params) request.params = route.request.params;
  if (route.request?.query) request.query = route.request.query;
  if (route.request?.body) {
    request.body = { content: { [json]: { schema: route.request.body } }, required: true };
  }
  if (route.auth !== undefined && route.auth !== false && auth === undefined) {
    throw new Error(`${route.path} needs its auth middleware.`);
  }
  // The console's cookie is sent only to /admin/v1, and only the console's
  // guard may open it (ADR 0028): a route there needs an operator unless it
  // is one of the sign-in steps in openAdminRoutes.
  const underAdmin = route.path.startsWith(`${adminPrefix}/`);
  const open = openAdminRoutes.has(`${route.method.toUpperCase()} ${route.path}`);
  if (route.auth === "operator" ? !underAdmin : underAdmin && !open) {
    throw new Error(`${route.path}: console routes, and only they, live under /admin/v1.`);
  }
  const token: Record<string, string[]> = { [bearerAuth]: [] };
  // An empty requirement documents that the token may be left out.
  const none: Record<string, string[]> = {};
  const cookie: Record<string, string[]> = { [operatorSession]: [] };
  const security =
    route.auth === true
      ? { security: [token], middleware: auth }
      : route.auth === "optional"
        ? { security: [token, none], middleware: auth }
        : route.auth === "operator"
          ? { security: [cookie], middleware: auth }
          : {};
  return createRoute({
    method: route.method,
    path: route.path,
    summary: route.summary,
    tags: [...route.tags],
    request,
    responses,
    ...security,
  });
}

/**
 * The request part already checked against `schema` by the route, typed.
 * Parsing again is cheap and keeps the type honest.
 */
export function validated<S extends z.ZodType>(
  c: Context,
  target: "json" | "param" | "query",
  schema: S,
): z.output<S> {
  const request = c.req as unknown as { valid(target: string): unknown };
  return schema.parse(request.valid(target));
}
