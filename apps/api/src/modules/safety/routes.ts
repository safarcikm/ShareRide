import type { OpenAPIHono } from "@hono/zod-openapi";
import { blockFromBookingRoute, myBlocksRoute, unblockRoute } from "@shareride/contracts";
import type { MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { BlockService } from "./blocks.ts";

export function registerSafetyRoutes(
  app: OpenAPIHono<AppEnv>,
  blocks: BlockService,
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(blockFromBookingRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", blockFromBookingRoute.request.params);
    validated(c, "json", blockFromBookingRoute.request.body);
    const result = await blocks.blockFromBooking(authOf(c).userId, id);
    if (result.ok) return c.json({ together: result.value }, 200);
    return errorResponse(c, 404, "not_found", "There is no such booking of yours.");
  });

  app.openapi(toOpenApiRoute(unblockRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", unblockRoute.request.params);
    await blocks.unblock(authOf(c).userId, id);
    return c.body(null, 204);
  });

  app.openapi(toOpenApiRoute(myBlocksRoute, requireAuth), async (c) =>
    c.json({ blocked: await blocks.blocked(authOf(c).userId) }, 200),
  );
}
