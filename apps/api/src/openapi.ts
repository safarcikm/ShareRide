import { createRoute, type RouteConfig } from "@hono/zod-openapi";
import type { RouteDefinition } from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import type { z } from "zod";

const json = "application/json";

/** The OpenAPI name of the bearer token scheme used by routes marked `auth`. */
export const bearerAuth = "bearerAuth";

/**
 * Turns a framework-free contract route into a documented Hono route. Routes
 * marked `auth` get `requireAuth` and are documented as needing a token.
 */
export function toOpenApiRoute(
  route: RouteDefinition,
  requireAuth?: MiddlewareHandler,
): RouteConfig {
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
  if (route.auth === true && requireAuth === undefined) {
    throw new Error(`${route.path} needs requireAuth.`);
  }
  return createRoute({
    method: route.method,
    path: route.path,
    summary: route.summary,
    tags: [...route.tags],
    request,
    responses,
    ...(route.auth === true ? { security: [{ [bearerAuth]: [] }], middleware: requireAuth } : {}),
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
