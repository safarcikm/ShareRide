import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  adminCorridorsRoute,
  adminCreateCorridorRoute,
  adminMetricsCsvPath,
  adminMetricsQuerySchema,
  adminMetricsRoute,
  adminUpdateCorridorRoute,
  type AdminCorridor,
  type AdminMetrics,
} from "@shareride/contracts";
import {
  addIsoWeeks,
  compareIsoWeeks,
  err,
  formatIsoWeek,
  isoWeekOf,
  isoWeeksBetween,
  metricsCsv,
  ok,
  parseIsoWeek,
  startOfIsoWeek,
  type IsoWeek,
  type Result,
} from "@shareride/domain";
import type { Context, MiddlewareHandler } from "hono";
import { operatorOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { auditRequestOf } from "../admin/audit.ts";
import type { CorridorError, CorridorService, CorridorView } from "./corridors.ts";
import type { MetricsView, WeeklyMetricsService } from "./weekly.ts";

/** The weeks shown when none are asked for, and the most that can be. */
export const metricsDefaultWeeks = 8;
export const metricsMaxWeeks = 53;

export interface MetricsAdminRoutesDependencies {
  readonly corridors: CorridorService;
  readonly metrics: WeeklyMetricsService;
  readonly clock: () => Date;
  readonly requireOperator: MiddlewareHandler<AppEnv>;
  readonly clientAddress: (c: Context) => string;
}

const shown = (corridor: CorridorView): AdminCorridor => ({
  ...corridor,
  places: [...corridor.places],
  updatedAt: corridor.updatedAt.toISOString(),
});

const problems: Record<
  CorridorError["code"],
  { readonly path: string; readonly issue: string; readonly message: string }
> = {
  name_missing: { path: "name", issue: "missing", message: "Give the corridor a name." },
  name_too_long: { path: "name", issue: "too_long", message: "The name is too long." },
  too_few_places: {
    path: "placeIds",
    issue: "too_few",
    message: "A corridor has at least 2 places.",
  },
  too_many_places: {
    path: "placeIds",
    issue: "too_many",
    message: "A corridor has at most 12 places.",
  },
  place_twice: { path: "placeIds", issue: "twice", message: "A place can be on it once." },
  place_unknown: { path: "placeIds", issue: "not_found", message: "There is no such place." },
};

const shownMetrics = (view: MetricsView): AdminMetrics => ({
  corridorId: view.corridorId,
  weeks: view.weeks.map(({ week, metrics, computedAt }) => ({
    week: formatIsoWeek(week),
    startsOn: startOfIsoWeek(week).toISOString().slice(0, 10),
    metrics,
    computedAt: computedAt?.toISOString() ?? null,
  })),
  exitCriteria: {
    from: formatIsoWeek(view.exitCriteria.from),
    to: formatIsoWeek(view.exitCriteria.to),
    criteria: [...view.exitCriteria.criteria],
  },
  corridors: [...view.corridors],
});

type RangeIssue = { readonly path: "from" | "to"; readonly issue: string };

/** The weeks a query asks for: the last 8 up to this one unless it says otherwise. */
export function metricsRange(
  query: { readonly from?: string | undefined; readonly to?: string | undefined },
  now: Date,
): Result<{ from: IsoWeek; to: IsoWeek }, RangeIssue> {
  const to = query.to === undefined ? isoWeekOf(now) : parseIsoWeek(query.to);
  if (to === null) return err({ path: "to", issue: "no_such_week" });
  const from =
    query.from === undefined
      ? addIsoWeeks(to, -(metricsDefaultWeeks - 1))
      : parseIsoWeek(query.from);
  if (from === null) return err({ path: "from", issue: "no_such_week" });
  if (compareIsoWeeks(from, to) > 0) return err({ path: "to", issue: "before_from" });
  if (isoWeeksBetween(from, to).length > metricsMaxWeeks) {
    return err({ path: "from", issue: "too_many_weeks" });
  }
  return ok({ from, to });
}

/** The console's corridor and metrics routes under /admin/v1 (spec 10, 3.4 and section 6). */
export function registerMetricsAdminRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: MetricsAdminRoutesDependencies,
): void {
  const { corridors, metrics, clock, requireOperator, clientAddress } = dependencies;

  const by = (c: Context<AppEnv>) => {
    const { userId, sessionId } = operatorOf(c);
    return { operator: { userId, sessionId }, request: auditRequestOf(c, clientAddress) };
  };

  const refused = (c: Context, code: CorridorError["code"]) => {
    const { path, issue, message } = problems[code];
    return errorResponse(c, 400, "validation_failed", message, { details: [{ path, issue }] });
  };

  app.openapi(toOpenApiRoute(adminCorridorsRoute, requireOperator), async (c) => {
    const overview = await corridors.overview();
    return c.json({ corridors: overview.corridors.map(shown), places: [...overview.places] }, 200);
  });

  app.openapi(toOpenApiRoute(adminCreateCorridorRoute, requireOperator), async (c) => {
    const body = validated(c, "json", adminCreateCorridorRoute.request.body);
    const made = await corridors.create(body, by(c));
    if (!made.ok) return refused(c, made.error.code);
    return c.json(shown(made.value), 201);
  });

  app.openapi(toOpenApiRoute(adminUpdateCorridorRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminUpdateCorridorRoute.request.params);
    const body = validated(c, "json", adminUpdateCorridorRoute.request.body);
    const changed = await corridors.update(id, body, by(c));
    if (!changed.ok) {
      return changed.error.code === "not_found"
        ? errorResponse(c, 404, "not_found", "There is no such corridor.")
        : refused(c, changed.error.code);
    }
    return c.json(shown(changed.value), 200);
  });

  const badRange = (c: Context, issue: RangeIssue) =>
    errorResponse(c, 400, "validation_failed", "Choose up to 53 weeks, the first one first.", {
      details: [issue],
    });
  const noCorridor = (c: Context) =>
    errorResponse(c, 404, "not_found", "There is no such corridor.");

  app.openapi(toOpenApiRoute(adminMetricsRoute, requireOperator), async (c) => {
    const query = validated(c, "query", adminMetricsRoute.request.query);
    const range = metricsRange(query, clock());
    if (!range.ok) return badRange(c, range.error);
    const view = await metrics.read({ ...range.value, corridorId: query.corridor ?? null });
    if (view === undefined) return noCorridor(c);
    return c.json(shownMetrics(view), 200);
  });

  // The same figures as a file, so not in the OpenAPI document.
  app.get(adminMetricsCsvPath, requireOperator, async (c) => {
    const query = adminMetricsQuerySchema.safeParse(c.req.query());
    if (!query.success) return badRange(c, { path: "from", issue: "no_such_week" });
    const range = metricsRange(query.data, clock());
    if (!range.ok) return badRange(c, range.error);
    const corridorId = query.data.corridor ?? null;
    const view = await metrics.read({ ...range.value, corridorId });
    if (view === undefined) return noCorridor(c);
    const name = view.corridors.find((corridor) => corridor.id === corridorId)?.name ?? "all";
    const file = `puffinride-metrics-${formatIsoWeek(range.value.from)}-${formatIsoWeek(range.value.to)}.csv`;
    return c.body(metricsCsv(name, view.weeks), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
  });
}
