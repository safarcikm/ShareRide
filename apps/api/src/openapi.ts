import { createRoute, type RouteConfig } from "@hono/zod-openapi";
import type { RouteDefinition } from "@shareride/contracts";

const json = "application/json";

/** Turns a framework-free contract route into a documented Hono route. */
export function toOpenApiRoute(route: RouteDefinition): RouteConfig {
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
  return createRoute({
    method: route.method,
    path: route.path,
    summary: route.summary,
    tags: [...route.tags],
    request,
    responses,
  });
}
