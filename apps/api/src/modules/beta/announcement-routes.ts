import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  adminAnnouncementReachRoute,
  adminAnnouncementsRoute,
  adminCreateAnnouncementRoute,
  adminSendAnnouncementRoute,
  adminTestAnnouncementRoute,
  adminUpdateAnnouncementRoute,
  myAnnouncementsRoute,
  type AdminAnnouncement,
} from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { authOf, operatorOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { auditRequestOf } from "../admin/audit.ts";
import type { AnnouncementError, AnnouncementService, AnnouncementView } from "./announcements.ts";

export interface AnnouncementAdminRoutesDependencies {
  readonly announcements: AnnouncementService;
  readonly requireOperator: MiddlewareHandler<AppEnv>;
  readonly clientAddress: (c: Context) => string;
}

const shown = (view: AnnouncementView): AdminAnnouncement => ({
  ...view,
  createdAt: view.createdAt.toISOString(),
  testSentAt: view.testSentAt?.toISOString() ?? null,
  sentAt: view.sentAt?.toISOString() ?? null,
});

/** Which field a refused announcement names, and why. */
function problemOf(error: AnnouncementError): {
  readonly path: string;
  readonly issue: string;
  readonly message: string;
} {
  switch (error.code) {
    case "text_missing":
      return {
        path: error.field,
        issue: "missing",
        message: "Write the title and the message in both languages.",
      };
    case "text_too_long":
      return {
        path: error.field,
        issue: "too_long",
        message: "A title has at most 80 characters and a message at most 1 000.",
      };
    case "corridor_missing":
      return { path: "corridorId", issue: "missing", message: "Choose the corridor." };
    case "corridor_unknown":
      return { path: "corridorId", issue: "not_found", message: "There is no such corridor." };
  }
}

/** The console's announcement routes under /admin/v1 (spec 10, 3.5 and section 6). */
export function registerAnnouncementAdminRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: AnnouncementAdminRoutesDependencies,
): void {
  const { announcements, requireOperator, clientAddress } = dependencies;

  const by = (c: Context<AppEnv>) => {
    const { userId, sessionId } = operatorOf(c);
    return { operator: { userId, sessionId }, request: auditRequestOf(c, clientAddress) };
  };
  const none = (c: Context<AppEnv>) =>
    errorResponse(c, 404, "not_found", "There is no such announcement.");
  const sentAlready = (c: Context<AppEnv>) =>
    errorResponse(c, 409, "already_sent", "This announcement has been sent.");
  const refused = (c: Context<AppEnv>, error: AnnouncementError) => {
    const { path, issue, message } = problemOf(error);
    return errorResponse(c, 400, "validation_failed", message, { details: [{ path, issue }] });
  };

  app.openapi(toOpenApiRoute(adminAnnouncementsRoute, requireOperator), async (c) => {
    const overview = await announcements.overview();
    return c.json(
      { announcements: overview.announcements.map(shown), corridors: [...overview.corridors] },
      200,
    );
  });

  app.openapi(toOpenApiRoute(adminCreateAnnouncementRoute, requireOperator), async (c) => {
    const body = validated(c, "json", adminCreateAnnouncementRoute.request.body);
    const made = await announcements.create(body, by(c));
    return made.ok ? c.json(shown(made.value), 201) : refused(c, made.error);
  });

  app.openapi(toOpenApiRoute(adminUpdateAnnouncementRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminUpdateAnnouncementRoute.request.params);
    const body = validated(c, "json", adminUpdateAnnouncementRoute.request.body);
    const changed = await announcements.update(id, body, by(c));
    if (changed.ok) return c.json(shown(changed.value), 200);
    if (changed.error.code === "not_found") return none(c);
    if (changed.error.code === "already_sent") return sentAlready(c);
    return refused(c, changed.error);
  });

  app.openapi(toOpenApiRoute(adminAnnouncementReachRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminAnnouncementReachRoute.request.params);
    const reach = await announcements.reach(id);
    return reach === undefined ? none(c) : c.json(reach, 200);
  });

  app.openapi(toOpenApiRoute(adminTestAnnouncementRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminTestAnnouncementRoute.request.params);
    const tested = await announcements.test(id, by(c));
    return tested.ok ? c.json(shown(tested.value), 200) : none(c);
  });

  app.openapi(toOpenApiRoute(adminSendAnnouncementRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminSendAnnouncementRoute.request.params);
    const sent = await announcements.send(id, by(c));
    if (sent.ok) return c.json(shown(sent.value), 200);
    return sent.error.code === "not_found" ? none(c) : sentAlready(c);
  });
}

/** What a person reads under "Beta news" (plan 4.7). */
export function registerAnnouncementRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: {
    readonly announcements: AnnouncementService;
    readonly requireAuth: MiddlewareHandler<AppEnv>;
  },
): void {
  const { announcements, requireAuth } = dependencies;
  app.openapi(toOpenApiRoute(myAnnouncementsRoute, requireAuth), async (c) => {
    const sent = await announcements.sentTo(authOf(c).userId);
    return c.json(
      {
        announcements: sent.map((announcement) => ({
          ...announcement,
          sentAt: announcement.sentAt.toISOString(),
        })),
      },
      200,
    );
  });
}
