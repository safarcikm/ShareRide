import { randomInt } from "node:crypto";
import { OpenAPIHono } from "@hono/zod-openapi";
import { appleCallbackRoute, healthReadyRoute, healthRoute } from "@shareride/contracts";
import type { Database } from "@shareride/db";
import {
  bookingSettingsFrom,
  defaultChatSettings,
  clientPlatformHeader,
  defaultMeetingPointIssueSettings,
  defaultNotificationSettings,
  defaultReviewSettings,
  inviteCheckLimitsPerAddress,
  operatorSignInLimitsPerAddress,
  memberPasskeyRules,
  operatorPasswordRules,
  providerSignInRules,
  searchLimitsPerAddress,
  type ReturnUrlsAllowed,
  type SettingValues,
  switchKeys,
} from "@shareride/domain";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { routePath } from "hono/route";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv } from "./context.ts";
import { errorBody, errorResponse } from "./errors.ts";
import type { Logger } from "./logger.ts";
import {
  createOperatorSessionService,
  createPasskeyService,
  createPasswordSignIn,
  createRecoveryService,
  createRequireOperator,
  guardAdminPaths,
  operatorCookie,
  registerAdminAuthRoutes,
  registerAdminRoutes,
  registerHomeAdminRoute,
} from "./modules/admin/index.ts";
import {
  createAccountService,
  createProfilePhotoService,
  createEmailService,
  registerAccountRoutes,
  registerProfilePhotoRoutes,
  registerEmailRoutes,
} from "./modules/account/index.ts";
import { checkStanding } from "./modules/account/standing.ts";
import {
  createAuthService,
  createOptionalAuth,
  createMemberPasskeyService,
  createPasswordService,
  createProviderSignInService,
  createRequireAuth,
  registerAuthRoutes,
  registerPasskeyRoutes,
  registerPasswordRoutes,
  registerProviderRoutes,
} from "./modules/auth/index.ts";
import {
  createBookingService,
  movePaymentDeadlines,
  registerBookingRoutes,
} from "./modules/bookings/index.ts";
import { createChatService, registerChatRoutes } from "./modules/chat/index.ts";
import {
  createDisputeAdminService,
  createReportService,
  createTripDayService,
  registerDisputeAdminRoutes,
  registerTripDayRoutes,
} from "./modules/trip-day/index.ts";
import { createReviewService, registerReviewRoutes } from "./modules/reviews/index.ts";
import {
  createPeopleService,
  createReliabilityAdminService,
  registerPeopleRoutes,
  registerReliabilityAdminRoutes,
} from "./modules/people/index.ts";
import {
  createAnnouncementService,
  createFeedbackService,
  createInviteService,
  registerAnnouncementAdminRoutes,
  registerAnnouncementRoutes,
  registerFeedbackAdminRoutes,
  registerFeedbackRoutes,
  registerInviteAdminRoutes,
  registerInviteRoutes,
} from "./modules/beta/index.ts";
import { createDrivingService, registerDrivingRoutes } from "./modules/driving/index.ts";
import { createLegalService, registerLegalRoutes } from "./modules/legal/index.ts";
import {
  createPausedCheck,
  liveRuleSettings,
  pausedHeldIn,
  readSettingsFirst,
  createSettingsService,
  tripSettingsSource,
  registerConfigRoutes,
  registerSettingsAdminRoutes,
  ruleSettingsSource,
  settingValuesIn,
} from "./modules/settings/index.ts";
import {
  createLegService,
  createMeetingPointAdminService,
  createMeetingPointIssueService,
  createMeetingPointPhotoService,
  createMeetingPointService,
  registerLegAdminRoutes,
  registerMeetingPointIssueAdminRoutes,
  registerMeetingPointPhotoAdminRoutes,
  registerMeetingPointRoutes,
  registerMeetingPointsAdminRoutes,
} from "./modules/meeting-points/index.ts";
import {
  createCorridorService,
  createSearchLog,
  createWeeklyMetricsService,
  registerMetricsAdminRoutes,
  type SearchLog,
} from "./modules/metrics/index.ts";
import {
  createModerationConsoleService,
  createNoticeService,
  createPeopleConsoleService,
  registerModerationAdminRoutes,
  registerNoticeRoutes,
  registerPeopleAdminRoutes,
} from "./modules/moderation/index.ts";
import {
  failedDeliveriesSince,
  registerNotificationRoutes,
  registerOwnEmailAdminRoutes,
} from "./modules/notifications/index.ts";
import { createPaymentService, registerPaymentRoutes } from "./modules/payments/index.ts";
import {
  createDeletionService,
  createExportService,
  createPrivacyRequests,
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
import type { IdentityProvider } from "./platform/identity-providers.ts";
import { addressBlock } from "./platform/client-address.ts";
import { createMemoryRateLimiter } from "./platform/memory-rate-limiter.ts";
import type { PaymentProvider } from "./platform/payments.ts";
import type { EmailChannel } from "./platform/email.ts";
import { createRoadFileRouter, type Router } from "./platform/router.ts";
import type { SmsSender } from "./platform/sms.ts";
import {
  photoFilesPath,
  photoKeyPattern,
  type FolderPhotoStorage,
  type PhotoStorage,
} from "./platform/photo-storage.ts";
import { createAdminApp } from "./admin-app.ts";
import { createWebApp, openerPolicyFor, type Analytics } from "./web-app.ts";
import {
  mayIndex,
  noIndex,
  notIndexed,
  publicPages,
  robotsTxt,
  sitemapXml,
  type SearchEngines,
} from "./search-engines.ts";

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
  /** The console's temporary password (ADR 0041); left out, password sign-in is off. */
  readonly adminPassword?: string;
  /**
   * The website's origin, which members' Face ID or fingerprint is bound to
   * (ADR 0048). Left out, it is off.
   */
  readonly passkeyOrigin?: string;
  /** Where meeting point and profile photos are kept (ADRs 0022 and 0033); none when `PHOTO_STORAGE=none`. */
  readonly photos?: PhotoStorage;
  /** The same storage when it is a folder, whose files the API serves itself. */
  readonly photoFiles?: FolderPhotoStorage;
  /** Finds the legs between meeting points; our road file when left out (ADR 0031). */
  readonly router?: Router;
  /** Where searches are noted, without the searcher; made here when left out. */
  readonly searchLog?: SearchLog;
  /** Settings held whatever is stored: tests and the browser tests' server only. */
  readonly fixedSettings?: Partial<SettingValues>;
  /** Google and Apple sign-in (ADR 0034); none is on when left out. */
  readonly signIn?: SignInDependencies;
}

/** Google and Apple sign-in through our API (ADR 0034). */
export interface SignInDependencies {
  /** The providers that are on: Google's and Apple's own, or the development stand-in. */
  readonly providers: readonly IdentityProvider[];
  /** Where browsers reach the API, for the providers' callback addresses. */
  readonly apiOrigin: string;
  /** Where the browser window may go back to with a ticket. */
  readonly returnUrls: ReturnUrlsAllowed;
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
  /** What search engines may index (spec 23); nothing when left out. */
  readonly searchEngines?: SearchEngines;
  /** Google Analytics on the website (spec 23); none when left out. */
  readonly analytics?: Analytics | null;
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
      allowHeaders: ["Content-Type", "Authorization", clientPlatformHeader],
      exposeHeaders: ["X-Request-Id", "Retry-After"],
      maxAge: 600,
    });
    // The console is served from the API's own origin and is never called
    // from another one, so its routes allow no other origin (ADR 0028).
    app.use(async (c, next) =>
      c.req.path.startsWith("/admin/") ? next() : allowWebOrigins(c, next),
    );
  }
  if (dependencies.features?.photoFiles !== undefined) {
    // Development and tests only: the web app there runs on another port and
    // shows these photos, so they may be shown from another origin. Before
    // the secure headers, so this runs after them and keeps the last word.
    app.use(`${photoFilesPath}/*`, async (c, next) => {
      await next();
      c.res.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    });
  }
  // Before the secure headers, so it has the last word on the opener
  // policy: Google's and Apple's pop-up stays linked to its page (ADR 0034).
  app.use(async (c, next) => {
    await next();
    const policy = openerPolicyFor(c.req.path);
    if (policy !== null) c.res.headers.set("Cross-Origin-Opener-Policy", policy);
  });
  app.use(secureHeaders());
  // Only production's public pages may be indexed; every other answer, and
  // every answer off production, says so (spec 23, R23.6; R4.6).
  const searchEngines = dependencies.searchEngines ?? notIndexed;
  app.use(async (c, next) => {
    await next();
    if (!mayIndex(searchEngines, c.req.path)) c.res.headers.set("X-Robots-Tag", noIndex);
  });
  app.get("/robots.txt", (c) => {
    c.header("Cache-Control", "public, max-age=3600");
    return c.text(robotsTxt(searchEngines));
  });
  const sitemapOrigin = searchEngines.indexable ? searchEngines.siteOrigin : null;
  const sitemapDb = dependencies.features?.db;
  if (sitemapOrigin !== null && sitemapDb !== undefined) {
    app.get("/sitemap.xml", async (c) => {
      c.header("Content-Type", "application/xml; charset=utf-8");
      c.header("Cache-Control", "public, max-age=3600");
      return c.body(sitemapXml(sitemapOrigin, await publicPages(sitemapDb)));
    });
  }
  app.use(
    createMiddleware<AppEnv>(async (c, next) => {
      // Bodies are JSON only. A browser cannot send JSON to another site
      // without a CORS preflight, so forms and text posts from other pages,
      // which carry cookies, are refused here. The one exception is Apple's
      // callback, which Apple posts as a form: it reads no cookie and takes
      // only a state that works once (ADR 0034).
      const hasBody = ["POST", "PUT", "PATCH"].includes(c.req.method);
      const type = c.req.header("content-type") ?? "";
      const form =
        c.req.method === "POST" &&
        c.req.path === appleCallbackRoute.path &&
        /^application\/x-www-form-urlencoded\s*(;|$)/i.test(type);
      if (hasBody && !form && !/^application\/json\s*(;|$)/i.test(type)) {
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
    const legal = createLegalService(features);
    const account = createAccountService({ ...features, legal });
    const operatorSettings = createSettingsService({
      ...features,
      // Nobody can pay while bookings are paused, so the payment deadlines
      // move with the switch (spec 10, 3.3).
      onChange: async (tx, change, now) => {
        if (change.key !== "bookings_open") return;
        await movePaymentDeadlines(tx, change.newValue === 0 ? "starts" : "ends", now, {
          bookings: bookingSettingsFrom(await settingValuesIn(tx)),
          notifications: defaultNotificationSettings,
        });
      },
    });
    const paused = createPausedCheck(operatorSettings);
    // The trip day's and reliability's values as they are now, for every
    // module that takes them as plain settings.
    const { tripDay: tripDaySettings, reliability: reliabilitySettings } = liveRuleSettings(
      () => operatorSettings.lastRead().values,
    );
    app.use("/v1/*", readSettingsFirst(operatorSettings));
    app.use("/admin/v1/*", readSettingsFirst(operatorSettings));
    const secureRandomInt = features.randomInt ?? ((max: number) => randomInt(max));
    const invites = createInviteService({
      ...features,
      settings: operatorSettings,
      randomInt: secureRandomInt,
    });
    const auth = createAuthService({
      ...features,
      logger,
      randomInt: secureRandomInt,
      signUpGate: invites.gate,
      smsPaused: () => paused("sms"),
    });
    const requireAuth = createRequireAuth(auth);
    if (features.adminOrigin !== undefined) {
      const passkeys = createPasskeyService({
        ...features,
        sessions: operatorSessions,
        adminOrigin: features.adminOrigin,
      });
      registerAdminAuthRoutes(app, {
        ...features,
        logger,
        passkeys,
        recovery: createRecoveryService({
          ...features,
          auth,
          passkeys,
          sessions: operatorSessions,
        }),
        password: createPasswordSignIn({
          ...features,
          sessions: operatorSessions,
          password: features.adminPassword,
        }),
        passwordLimiters: {
          perAddress: createMemoryRateLimiter({
            rules: operatorPasswordRules.triesPerAddress,
            clock: features.clock,
          }),
          all: createMemoryRateLimiter({
            rules: operatorPasswordRules.triesFromAll,
            clock: features.clock,
          }),
        },
        requireOperator,
        limiter: createMemoryRateLimiter({
          rules: operatorSignInLimitsPerAddress,
          clock: features.clock,
        }),
        clientKey: (c) =>
          features.hasher("operator-sign-in", addressBlock(features.clientAddress(c))),
      });
    }
    registerAuthRoutes(app, { ...features, auth, account, requireAuth });
    const providerSignIn = createProviderSignInService({
      ...features,
      logger,
      auth,
      providers: features.signIn?.providers ?? [],
      apiOrigin: features.signIn?.apiOrigin ?? "",
      returnUrls: features.signIn?.returnUrls ?? {
        webOrigins: [],
        appScheme: "puffinride",
        allowExpoGo: false,
      },
      limiter: createMemoryRateLimiter({
        rules: providerSignInRules.startLimits,
        clock: features.clock,
      }),
    });
    const passwords = createPasswordService({ ...features, logger, auth });
    const memberPasskeys =
      features.passkeyOrigin === undefined
        ? undefined
        : createMemberPasskeyService({
            ...features,
            logger,
            auth,
            passkeyOrigin: features.passkeyOrigin,
          });
    registerProviderRoutes(app, {
      ...features,
      providers: providerSignIn,
      passwords,
      ...(memberPasskeys === undefined ? {} : { passkeys: memberPasskeys }),
      account,
      requireAuth,
      // A keyed hash of the address's block, as for the other limits per address.
      clientKey: (c) => features.hasher("oauth-start", addressBlock(features.clientAddress(c))),
    });
    registerPasswordRoutes(app, {
      ...features,
      passwords,
      account,
      requireAuth,
    });
    if (memberPasskeys !== undefined) {
      registerPasskeyRoutes(app, {
        ...features,
        passkeys: memberPasskeys,
        account,
        requireAuth,
        limiter: createMemoryRateLimiter({
          rules: memberPasskeyRules.signInOptionsLimits,
          clock: features.clock,
        }),
        clientKey: (c) =>
          features.hasher("passkey-sign-in", addressBlock(features.clientAddress(c))),
      });
    }
    registerAccountRoutes(app, account, requireAuth);
    registerProfilePhotoRoutes(
      app,
      createProfilePhotoService({ ...features, logger }),
      account,
      requireAuth,
    );
    registerEmailRoutes(app, {
      email: createEmailService({ ...features, logger }),
      account,
      auth,
      requireAuth,
    });
    const driving = createDrivingService({ ...features, account });
    registerDrivingRoutes(app, driving, requireAuth);
    registerLegalRoutes(app, legal);
    const photos = createMeetingPointPhotoService({ ...features, logger });
    const issues = createMeetingPointIssueService({
      ...features,
      settings: defaultMeetingPointIssueSettings,
    });
    registerMeetingPointRoutes(
      app,
      createMeetingPointService(features),
      photos,
      issues,
      requireAuth,
    );
    const legs = createLegService({
      ...features,
      router: features.router ?? createRoadFileRouter(),
    });
    const meetingPointsAdmin = {
      ...features,
      meetingPoints: createMeetingPointAdminService({ ...features, legs }),
      photos,
      issues,
      legs,
      requireOperator,
    };
    registerMeetingPointsAdminRoutes(app, meetingPointsAdmin);
    registerMeetingPointIssueAdminRoutes(app, meetingPointsAdmin);
    registerMeetingPointPhotoAdminRoutes(app, meetingPointsAdmin);
    registerLegAdminRoutes(app, meetingPointsAdmin);
    const { photoFiles } = features;
    if (photoFiles !== undefined) {
      // Development and tests only: the configuration refuses a folder in production.
      app.get(`${photoFilesPath}/*`, async (c) => {
        const key = c.req.path.slice(photoFilesPath.length + 1);
        const file = photoKeyPattern.test(key) ? await photoFiles.read(key) : undefined;
        if (file === undefined)
          return errorResponse(c, 404, "not_found", "There is no such photo.");
        return c.body(file, 200, { "Content-Type": "image/jpeg", "Cache-Control": "no-cache" });
      });
    }
    const ruleSettings = ruleSettingsSource(operatorSettings);
    // Before the trip routes, so /v1/trips/search is never taken for a trip's ID.
    registerSearchRoutes(app, {
      search: createSearchService({
        ...features,
        settings: () => ruleSettings.search(),
        searchLog: features.searchLog ?? createSearchLog({ ...features, logger }),
      }),
      details: createTripDetailsService({
        ...features,
        settings: () => ruleSettings.search(),
        reliabilitySettings,
      }),
      optionalAuth: createOptionalAuth(auth),
      limiter: createMemoryRateLimiter({ rules: searchLimitsPerAddress, clock: features.clock }),
      // A keyed hash, as for sign-in limits: no plain address is kept, even in memory.
      clientKey: (c) => features.hasher("search-address", addressBlock(features.clientAddress(c))),
      standing: (userId) => checkStanding(features.db, userId, features.clock()),
    });
    const settings = tripSettingsSource(operatorSettings);
    registerTripRoutes(app, createRouteService({ ...features, settings }), requireAuth);
    const trips = createTripService({
      ...features,
      settings,
      tripDaySettings,
      driving,
    });
    registerDraftRoutes(app, trips, requireAuth, paused);
    registerTripChangeRoutes(
      app,
      createTripChangeService({
        ...features,
        settings,
        ruleSettings,
        notificationSettings: defaultNotificationSettings,
        bookingsPausedIn: (tx) => pausedHeldIn(tx, "bookings"),
      }),
      requireAuth,
    );
    const bookings = createBookingService({
      ...features,
      account,
      settings: ruleSettings,
      tripDaySettings,
      reliabilitySettings,
      bookingsPausedIn: (tx) => pausedHeldIn(tx, "bookings"),
    });
    registerBookingRoutes(app, bookings, requireAuth, trips, paused);
    registerChatRoutes(
      app,
      createChatService({ ...features, bookings, settings: defaultChatSettings }),
      requireAuth,
    );
    registerTripDayRoutes(
      app,
      createTripDayService({ ...features, settings: tripDaySettings }),
      createReportService({ ...features, settings: tripDaySettings }),
      requireAuth,
    );
    const disputes = createDisputeAdminService({ ...features, settings: tripDaySettings });
    registerDisputeAdminRoutes(app, { ...features, disputes, requireOperator });
    const reliability = createReliabilityAdminService({
      ...features,
      settings: reliabilitySettings,
    });
    registerReliabilityAdminRoutes(app, {
      ...features,
      reliability,
      settings: reliabilitySettings,
      requireOperator,
    });
    registerConfigRoutes(
      app,
      operatorSettings,
      providerSignIn.names,
      dependencies.analytics ?? null,
      features.email !== undefined,
      memberPasskeys !== undefined,
    );
    registerSettingsAdminRoutes(app, { ...features, settings: operatorSettings, requireOperator });
    registerInviteRoutes(app, {
      invites,
      limiter: createMemoryRateLimiter({
        rules: inviteCheckLimitsPerAddress,
        clock: features.clock,
      }),
      clientKey: (c) => features.hasher("invite-check", addressBlock(features.clientAddress(c))),
    });
    registerInviteAdminRoutes(app, { ...features, invites, requireOperator });
    registerMetricsAdminRoutes(app, {
      ...features,
      corridors: createCorridorService(features),
      metrics: createWeeklyMetricsService(features),
      requireOperator,
    });
    const feedback = createFeedbackService(features);
    registerFeedbackRoutes(app, { feedback, requireAuth });
    registerFeedbackAdminRoutes(app, { ...features, feedback, requireOperator });
    const announcements = createAnnouncementService(features);
    registerAnnouncementRoutes(app, { announcements, requireAuth });
    registerAnnouncementAdminRoutes(app, { ...features, announcements, requireOperator });
    registerReviewRoutes(
      app,
      createReviewService({ ...features, settings: defaultReviewSettings }),
      requireAuth,
    );
    registerPeopleRoutes(
      app,
      createPeopleService({ ...features, settings: reliabilitySettings }),
      requireAuth,
    );
    registerNotificationRoutes(app, { ...features, requireAuth });
    registerOwnEmailAdminRoutes(app, { ...features, requireOperator });
    registerSafetyRoutes(
      app,
      {
        blocks: createBlockService({ ...features, bookings }),
        reports: createSafetyReportService(features),
      },
      requireAuth,
    );
    registerNoticeRoutes(app, createNoticeService(features), requireAuth);
    const moderation = createModerationConsoleService({
      ...features,
      reliability: reliabilitySettings,
    });
    registerModerationAdminRoutes(app, { ...features, moderation, requireOperator });
    // The console's home page: each count asked of its own module, as its list is.
    registerHomeAdminRoute(app, {
      clock: features.clock,
      requireOperator,
      sources: {
        openReports: () => moderation.reports("open"),
        openAppeals: async () => (await moderation.appeals("open")).length,
        disputesWaiting: async () => (await disputes.list("waiting")).length,
        meetingPointProblems: async () => (await issues.queue()).length,
        meetingPointReviewsOverdue: async () =>
          (await meetingPointsAdmin.meetingPoints.list({ reviewOverdue: true })).length,
        failedNotificationsSince: (since) => failedDeliveriesSince(features.db, since),
        watched: async () => (await reliability.watched()).length,
        newFeedback: async () => (await feedback.list({})).newCount,
        beta: () => invites.overview(),
        switchesOff: async () => {
          const switches = await operatorSettings.switches();
          return switchKeys.filter((key) => !switches[key].on);
        },
      },
    });
    registerPeopleAdminRoutes(app, {
      ...features,
      people: createPeopleConsoleService({ ...features, reliability: reliabilitySettings }),
      requireOperator,
    });
    registerPaymentRoutes(app, {
      payments: createPaymentService({ ...features, provider: features.payments }),
      bookings,
      testProvider: features.payments?.name === "test",
      requireAuth,
      paused,
    });
    registerPrivacyRoutes(app, {
      exports: createExportService({ ...features, auth, cipher: features.exportCipher, logger }),
      deletion: createDeletionService({
        ...features,
        auth,
        tripDaySettings,
        logger,
      }),
      account,
      requests: createPrivacyRequests(features),
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
    info: { title: "PuffinRide API", version: "1" },
  });

  const photoOrigin = dependencies.features?.photos?.origin ?? null;
  const webApp =
    dependencies.webAppDir === undefined
      ? undefined
      : createWebApp(
          dependencies.webAppDir,
          photoOrigin,
          searchEngines,
          dependencies.analytics ?? null,
        );
  const adminApp =
    dependencies.adminAppDir === undefined
      ? undefined
      : createAdminApp(dependencies.adminAppDir, photoOrigin);
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
