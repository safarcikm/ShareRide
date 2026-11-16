import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  getNotificationSettingsRoute,
  setPushTokenRoute,
  updateNotificationSettingsRoute,
} from "@shareride/contracts";
import type { Database } from "@shareride/db";
import type { MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { preferencesOf, setPreferences } from "./preferences.ts";
import { setPushToken } from "./push-tokens.ts";

export function registerNotificationRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: {
    readonly db: Database;
    readonly clock: () => Date;
    readonly requireAuth: MiddlewareHandler;
  },
): void {
  const { db, clock, requireAuth } = dependencies;
  app.openapi(toOpenApiRoute(setPushTokenRoute, requireAuth), async (c) => {
    const { token } = validated(c, "json", setPushTokenRoute.request.body);
    await setPushToken(db, authOf(c), token, clock());
    return c.body(null, 204);
  });

  app.openapi(toOpenApiRoute(getNotificationSettingsRoute, requireAuth), async (c) => {
    return c.json(await preferencesOf(db, authOf(c).userId), 200);
  });

  app.openapi(toOpenApiRoute(updateNotificationSettingsRoute, requireAuth), async (c) => {
    const body = validated(c, "json", updateNotificationSettingsRoute.request.body);
    return c.json(await setPreferences(db, authOf(c).userId, body, clock()), 200);
  });
}
