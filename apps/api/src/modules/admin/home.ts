import type { OpenAPIHono } from "@hono/zod-openapi";
import { adminHomeRoute, type AdminHome } from "@shareride/contracts";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../../context.ts";
import { toOpenApiRoute } from "../../openapi.ts";

/**
 * Where each of the home page's counts comes from: its own module, asked
 * as its list is, so a count and the list it links to always agree (spec
 * 10, 3.1.1).
 */
export interface HomeSources {
  /** The open reports about people: whether each is urgent. */
  readonly openReports: () => Promise<readonly { readonly urgent: boolean }[]>;
  readonly openAppeals: () => Promise<number>;
  readonly disputesWaiting: () => Promise<number>;
  readonly meetingPointProblems: () => Promise<number>;
  readonly meetingPointReviewsOverdue: () => Promise<number>;
  /** Sends given up as failed since a time. */
  readonly failedNotificationsSince: (since: Date) => Promise<number>;
  readonly watched: () => Promise<number>;
  readonly newFeedback: () => Promise<number>;
  /** Whether an invite code is needed, and the places left if so. */
  readonly beta: () => Promise<{ readonly required: boolean; readonly placesLeft: number }>;
  /** The keys of the switches for emergencies that are off. */
  readonly switchesOff: () => Promise<readonly string[]>;
}

/** Failed notifications are counted over this long. */
export const failedNotificationsHours = 24;

export async function homeCounts(sources: HomeSources, now: Date): Promise<AdminHome> {
  const [
    reports,
    appeals,
    disputes,
    meetingPointProblems,
    meetingPointReviewsOverdue,
    failedNotifications,
    watched,
    newFeedback,
    beta,
    switchesOff,
  ] = await Promise.all([
    sources.openReports(),
    sources.openAppeals(),
    sources.disputesWaiting(),
    sources.meetingPointProblems(),
    sources.meetingPointReviewsOverdue(),
    sources.failedNotificationsSince(
      new Date(now.getTime() - failedNotificationsHours * 3600 * 1000),
    ),
    sources.watched(),
    sources.newFeedback(),
    sources.beta(),
    sources.switchesOff(),
  ]);
  const urgent = reports.filter((report) => report.urgent).length;
  return {
    reports: { urgent, other: reports.length - urgent },
    appeals,
    disputes,
    meetingPointProblems,
    meetingPointReviewsOverdue,
    failedNotifications,
    watched,
    newFeedback,
    placesLeft: beta.required ? beta.placesLeft : null,
    switchesOff: [...switchesOff],
  };
}

/** `GET /admin/v1/home`: today's counts (spec 10, 3.1.1). */
export function registerHomeAdminRoute(
  app: OpenAPIHono<AppEnv>,
  dependencies: {
    readonly sources: HomeSources;
    readonly clock: () => Date;
    readonly requireOperator: MiddlewareHandler<AppEnv>;
  },
): void {
  const { sources, clock, requireOperator } = dependencies;
  app.openapi(toOpenApiRoute(adminHomeRoute, requireOperator), async (c) => {
    return c.json(await homeCounts(sources, clock()), 200);
  });
}
