import { randomInt } from "node:crypto";
import { OpenAPIHono } from "@hono/zod-openapi";
import { healthReadyRoute, healthRoute } from "@shareride/contracts";
import type { Database } from "@shareride/db";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { requestId } from "hono/request-id";
import { routePath } from "hono/route";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv } from "./context.ts";
import { errorBody } from "./errors.ts";
import type { Logger } from "./logger.ts";
import { createAccountService, registerAccountRoutes } from "./modules/account/index.ts";
import { createAuthService, createRequireAuth, registerAuthRoutes } from "./modules/auth/index.ts";
import { createLegalService, registerLegalRoutes } from "./modules/legal/index.ts";
import { bearerAuth, toOpenApiRoute } from "./openapi.ts";
import type { KeyedHasher } from "./platform/crypto.ts";
import type { SmsSender } from "./platform/sms.ts";

export type { AppEnv };

/** What sign-in, accounts and legal documents need. */
export interface FeatureDependencies {
  readonly db: Database;
  readonly sms: SmsSender;
  readonly hasher: KeyedHasher;
  readonly clock: () => Date;
  /** The caller's IP address, for per-address limits. */
  readonly clientAddress: (c: Context) => string;
  readonly secureCookies: boolean;
  /** A secure random integer in [0, max); tests may replace it. */
  readonly randomInt?: (max: number) => number;
}

export interface AppDependencies {
  readonly logger: Logger;
  /** Resolves when the database answers; rejects otherwise. */
  readonly checkDatabase: () => Promise<void>;
  /** Left out by tests of the platform alone (health, errors, logging). */
  readonly features?: FeatureDependencies;
  /** Web app origins allowed to call the API from a browser, with cookies. */
  readonly webOrigins?: readonly string[];
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
  const webOrigins = dependencies.webOrigins ?? [];
  if (webOrigins.length > 0) {
    app.use(
      cors({
        origin: [...webOrigins],
        credentials: true,
        allowHeaders: ["Content-Type", "Authorization"],
        exposeHeaders: ["X-Request-Id", "Retry-After"],
        maxAge: 600,
      }),
    );
  }
  app.use(secureHeaders());
  app.use(
    createMiddleware<AppEnv>(async (c, next) => {
      // Bodies are JSON only. A browser cannot send JSON to another site
      // without a CORS preflight, so forms and text posts from other pages,
      // which carry cookies, are refused here.
      const hasBody = ["POST", "PUT", "PATCH"].includes(c.req.method);
      const type = c.req.header("content-type") ?? "";
      if (hasBody && !/^application\/json\s*(;|$)/i.test(type)) {
        return c.json(
          errorBody("unsupported_media_type", "Send the body as application/json."),
          415,
        );
      }
      await next();
      return undefined;
    }),
  );
  app.use(
    createMiddleware<AppEnv>(async (c, next) => {
      const started = performance.now();
      await next();
      // The route pattern, not the URL: no IDs or query strings in logs.
      logger.info(
        {
          requestId: c.get("requestId"),
          userId: c.get("auth")?.userId,
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

  if (dependencies.features !== undefined) {
    const { features } = dependencies;
    const legal = createLegalService(features);
    const account = createAccountService({ ...features, legal });
    const auth = createAuthService({
      ...features,
      logger,
      randomInt: features.randomInt ?? ((max) => randomInt(max)),
    });
    const requireAuth = createRequireAuth(auth);
    registerAuthRoutes(app, { ...features, auth, account, requireAuth });
    registerAccountRoutes(app, account, requireAuth);
    registerLegalRoutes(app, legal);
  }

  app.openAPIRegistry.registerComponent("securitySchemes", bearerAuth, {
    type: "http",
    scheme: "bearer",
    description: "An access token from /v1/auth/phone/verify or /v1/auth/refresh",
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
