import { randomInt } from "node:crypto";
import { OpenAPIHono } from "@hono/zod-openapi";
import { healthReadyRoute, healthRoute } from "@shareride/contracts";
import type { Database } from "@shareride/db";
import {
  defaultBookingSettings,
  defaultChatSettings,
  defaultNotificationSettings,
  defaultReviewSettings,
  defaultSearchSettings,
  defaultTripDaySettings,
  defaultTripSettings,
  operatorSignInLimitsPerAddress,
  searchLimitsPerAddress,
} from "@shareride/domain";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { routePath } from "hono/route";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv } from "./context.ts";
import { errorBody } from "./errors.ts";
import type { Logger } from "./logger.ts";
import {
  createOperatorSessionService,
  createPasskeyService,
  createRequireOperator,
  guardAdminPaths,
  operatorCookie,
  registerAdminAuthRoutes,
  registerAdminRoutes,
} from "./modules/admin/index.ts";
import {
  createAccountService,
  createEmailService,
  registerAccountRoutes,
  registerEmailRoutes,
} from "./modules/account/index.ts";
import {
  createAuthService,
  createOptionalAuth,
  createRequireAuth,
  registerAuthRoutes,
} from "./modules/auth/index.ts";
import { createBookingService, registerBookingRoutes } from "./modules/bookings/index.ts";
import { createChatService, registerChatRoutes } from "./modules/chat/index.ts";
import {
  createReportService,
  createTripDayService,
  registerTripDayRoutes,
} from "./modules/trip-day/index.ts";
import { createReviewService, registerReviewRoutes } from "./modules/reviews/index.ts";
import { createDrivingService, registerDrivingRoutes } from "./modules/driving/index.ts";
import { createLegalService, registerLegalRoutes } from "./modules/legal/index.ts";
import {
  createMeetingPointAdminService,
  createMeetingPointService,
  registerMeetingPointRoutes,
  registerMeetingPointsAdminRoutes,
} from "./modules/meeting-points/index.ts";
import { registerNotificationRoutes } from "./modules/notifications/index.ts";
import { createPaymentService, registerPaymentRoutes } from "./modules/payments/index.ts";
import {
  createDeletionService,
  createExportService,
  registerPrivacyRoutes,
} from "./modules/privacy/index.ts";
import {
  createBlockService,
  createReportService as createSafetyReportService,
  registerSafetyRoutes,
} from "./modules/safety/index.ts";
import {
  createSearchService,
  createTripDetailsService,
  registerSearchRoutes,
} from "./modules/search/index.ts";
import {
  createRouteService,
  createTripChangeService,
  createTripService,
  registerDraftRoutes,
  registerTripChangeRoutes,
  registerTripRoutes,
} from "./modules/trips/index.ts";
import { bearerAuth, operatorSession, toOpenApiRoute } from "./openapi.ts";
import type { FileCipher, KeyedHasher } from "./platform/crypto.ts";
import { addressBlock } from "./platform/client-address.ts";
import { createMemoryRateLimiter } from "./platform/memory-rate-limiter.ts";
import type { PaymentProvider } from "./platform/payments.ts";
import type { EmailChannel } from "./platform/email.ts";
import type { SmsSender } from "./platform/sms.ts";
import { createAdminApp } from "./admin-app.ts";
import { createWebApp } from "./web-app.ts";

export type { AppEnv };

/** What sign-in, accounts, legal documents and meeting points need. */
export interface FeatureDependencies {
  readonly db: Database;
  readonly sms: SmsSender;
  /**
   * Email sent from requests (ADR 0027), and the web app its links open;
   * none when `EMAIL_PROVIDER=none`.
   */
  readonly email?: EmailChannel;
  readonly hasher: KeyedHasher;
  /** Seals data exports while they are kept (spec 11, decision 1). */
  readonly exportCipher: FileCipher;
  readonly clock: () => Date;
  /** The caller's IP address, for per-address limits. */
  readonly clientAddress: (c: Context) => string;
  readonly secureCookies: boolean;
  /** A secure random integer in [0, max); tests may replace it. */
  readonly randomInt?: (max: number) => number;
  /** Left out where paying is unavailable (PAYMENT_PROVIDER=none). */
  readonly payments?: PaymentProvider;
  /**
   * The operator console's origin, which passkeys are bound to (ADR 0028).
   * Left out, the console's sign-in is off.
   */
  readonly adminOrigin?: string;
}

/** Where the request was when an unexpected error happened. No personal data. */
export interface ErrorContext {
  readonly method: string;
  /** The route pattern, such as /v1/me, never the URL. */
  readonly route: string;
  readonly requestId: string | undefined;
}

/** Sends an unexpected error to error tracking (Sentry in staging and production). */
export type ErrorReporter = (error: unknown, context: ErrorContext) => void;

export interface AppDependencies {
  readonly logger: Logger;
  /** Resolves when the database answers; rejects otherwise. */
  readonly checkDatabase: () => Promise<void>;
  /** Left out by tests of the platform alone (health, errors, logging). */
  readonly features?: FeatureDependencies;
  /** Web app origins allowed to call the API from a browser, with cookies. */
  readonly webOrigins?: readonly string[];
  /** The exported web app to serve on this origin, outside /v1. */
  readonly webAppDir?: string;
  /** The operator console's build, served at /admin (ADR 0028). */
  readonly adminAppDir?: string;
  /** Reports unexpected errors; left out where there is no error tracking. */
  readonly reportError?: ErrorReporter;
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
    const allowWebOrigins = cors({
      origin: [...webOrigins],
      credentials: true,
      allowHeaders: ["Content-Type", "Authorization"],
      exposeHeaders: ["X-Request-Id", "Retry-After"],
      maxAge: 600,
    });
    // The console is served from the API's own origin and is never called
    // from another one, so its routes allow no other origin (ADR 0028).
    app.use(async (c, next) =>
      c.req.path.startsWith("/admin/") ? next() : allowWebOrigins(c, next),
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
          operatorId: c.get("operator")?.userId,
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
    // First: the guard covers only routes registered after it, and closes
    // every console route even if one forgets its own guard.
    const operatorSessions = createOperatorSessionService(features);
    const requireOperator = createRequireOperator(operatorSessions, features.secureCookies);
    app.use(guardAdminPaths(requireOperator));
    registerAdminRoutes(app, { ...features, sessions: operatorSessions, requireOperator });
    if (features.adminOrigin !== undefined) {
      registerAdminAuthRoutes(app, {
        ...features,
        logger,
        passkeys: createPasskeyService({
          ...features,
          sessions: operatorSessions,
          adminOrigin: features.adminOrigin,
        }),
        requireOperator,
        limiter: createMemoryRateLimiter({
          rules: operatorSignInLimitsPerAddress,
          clock: features.clock,
        }),
        clientKey: (c) =>
          features.hasher("operator-sign-in", addressBlock(features.clientAddress(c))),
      });
    }
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
    registerEmailRoutes(app, createEmailService({ ...features, logger }), account, requireAuth);
    const driving = createDrivingService({ ...features, account });
    registerDrivingRoutes(app, driving, requireAuth);
    registerLegalRoutes(app, legal);
    registerMeetingPointRoutes(app, createMeetingPointService(features));
    registerMeetingPointsAdminRoutes(app, {
      ...features,
      meetingPoints: createMeetingPointAdminService(features),
      requireOperator,
    });
    // Before the trip routes, so /v1/trips/search is never taken for a trip's ID.
    registerSearchRoutes(app, {
      // Operator settings (feature H4) replace the defaults later.
      search: createSearchService({ ...features, settings: defaultSearchSettings }),
      details: createTripDetailsService({ ...features, settings: defaultSearchSettings }),
      optionalAuth: createOptionalAuth(auth),
      limiter: createMemoryRateLimiter({ rules: searchLimitsPerAddress, clock: features.clock }),
      // A keyed hash, as for sign-in limits: no plain address is kept, even in memory.
      clientKey: (c) => features.hasher("search-address", addressBlock(features.clientAddress(c))),
    });
    const settings = defaultTripSettings;
    registerTripRoutes(app, createRouteService({ ...features, settings }), requireAuth);
    const trips = createTripService({
      ...features,
      settings,
      tripDaySettings: defaultTripDaySettings,
      driving,
    });
    registerDraftRoutes(app, trips, requireAuth);
    registerTripChangeRoutes(
      app,
      createTripChangeService({
        ...features,
        settings,
        bookingSettings: defaultBookingSettings,
        notificationSettings: defaultNotificationSettings,
      }),
      requireAuth,
    );
    const bookings = createBookingService({
      ...features,
      account,
      settings: defaultBookingSettings,
      tripDaySettings: defaultTripDaySettings,
    });
    registerBookingRoutes(app, bookings, requireAuth, trips);
    registerChatRoutes(
      app,
      createChatService({ ...features, bookings, settings: defaultChatSettings }),
      requireAuth,
    );
    registerTripDayRoutes(
      app,
      createTripDayService({ ...features, settings: defaultTripDaySettings }),
      createReportService({ ...features, settings: defaultTripDaySettings }),
      requireAuth,
    );
    registerReviewRoutes(
      app,
      createReviewService({ ...features, settings: defaultReviewSettings }),
      requireAuth,
    );
    registerNotificationRoutes(app, { ...features, requireAuth });
    registerSafetyRoutes(
      app,
      {
        blocks: createBlockService({ ...features, bookings }),
        reports: createSafetyReportService(features),
      },
      requireAuth,
    );
    registerPaymentRoutes(app, {
      payments: createPaymentService({ ...features, provider: features.payments }),
      bookings,
      testProvider: features.payments?.name === "test",
      requireAuth,
    });
    registerPrivacyRoutes(app, {
      exports: createExportService({ ...features, auth, cipher: features.exportCipher, logger }),
      deletion: createDeletionService({
        ...features,
        auth,
        tripDaySettings: defaultTripDaySettings,
        logger,
      }),
      account,
      requireAuth,
    });
  }

  app.openAPIRegistry.registerComponent("securitySchemes", bearerAuth, {
    type: "http",
    scheme: "bearer",
    description: "An access token from /v1/auth/phone/verify or /v1/auth/refresh",
  });
  app.openAPIRegistry.registerComponent("securitySchemes", operatorSession, {
    type: "apiKey",
    in: "cookie",
    name: operatorCookie.name,
    description: "The operator console's session, set when the operator signs in with a passkey",
  });
  app.doc31("/v1/openapi.json", {
    openapi: "3.1.0",
    info: { title: "ShareRide API", version: "1" },
  });

  const webApp =
    dependencies.webAppDir === undefined ? undefined : createWebApp(dependencies.webAppDir);
  const adminApp =
    dependencies.adminAppDir === undefined ? undefined : createAdminApp(dependencies.adminAppDir);
  app.notFound(
    async (c: Context<AppEnv, string>) =>
      (await adminApp?.(c)) ??
      (await webApp?.(c)) ??
      c.json(errorBody("not_found", "There is no such endpoint."), 404),
  );

  app.onError((error, c) => {
    // The client's mistake, such as JSON that does not parse: an answer, not a report.
    if (error instanceof HTTPException && error.status < 500) {
      return c.json(errorBody("validation_failed", "The request is not valid."), error.status);
    }
    logger.error({ requestId: c.get("requestId"), err: error }, "unhandled error");
    dependencies.reportError?.(error, {
      method: c.req.method,
      route: routePath(c),
      requestId: c.get("requestId"),
    });
    return c.json(errorBody("internal_error", "Something went wrong on our side."), 500);
  });

  return app;
}
