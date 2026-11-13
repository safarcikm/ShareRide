import { OpenAPIHono } from "@hono/zod-openapi";
import { healthReadyRoute, healthRoute } from "@shareride/contracts";
import { createMiddleware } from "hono/factory";
import { requestId, type RequestIdVariables } from "hono/request-id";
import { routePath } from "hono/route";
import { secureHeaders } from "hono/secure-headers";
import { errorBody } from "./errors.ts";
import type { Logger } from "./logger.ts";
import { toOpenApiRoute } from "./openapi.ts";

export interface AppDependencies {
  readonly logger: Logger;
  /** Resolves when the database answers; rejects otherwise. */
  readonly checkDatabase: () => Promise<void>;
}

export interface AppEnv {
  Variables: RequestIdVariables;
}

export function createApp(dependencies: AppDependencies): OpenAPIHono<AppEnv> {
  const { logger } = dependencies;

  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        // Paths and rule names only: never echo what was submitted.
        const details = result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          issue: issue.code,
        }));
        return c.json(errorBody("validation_failed", "The request is not valid.", details), 400);
      }
      return undefined;
    },
  });

  app.use(requestId());
  app.use(secureHeaders());
  app.use(
    createMiddleware<AppEnv>(async (c, next) => {
      const started = performance.now();
      await next();
      // The route pattern, not the URL: no IDs or query strings in logs.
      logger.info(
        {
          requestId: c.get("requestId"),
          method: c.req.method,
          route: routePath(c, -1),
          status: c.res.status,
          durationMs: Math.round(performance.now() - started),
        },
        "request",
      );
    }),
  );

  app.openapi(toOpenApiRoute(healthRoute), (c) => c.json({ status: "ok" as const }, 200));

  app.openapi(toOpenApiRoute(healthReadyRoute), async (c) => {
    try {
      await dependencies.checkDatabase();
      return c.json({ status: "ok" as const }, 200);
    } catch (error) {
      logger.warn({ requestId: c.get("requestId"), err: error }, "database not ready");
      return c.json({ status: "unavailable" as const }, 503);
    }
  });

  app.doc31("/v1/openapi.json", {
    openapi: "3.1.0",
    info: { title: "ShareRide API", version: "1" },
  });

  app.notFound((c) => c.json(errorBody("not_found", "There is no such endpoint."), 404));

  app.onError((error, c) => {
    logger.error({ requestId: c.get("requestId"), err: error }, "unhandled error");
    return c.json(errorBody("internal_error", "Something went wrong on our side."), 500);
  });

  return app;
}
