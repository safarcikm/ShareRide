import type { OpenAPIHono } from "@hono/zod-openapi";
import { myCo2Route } from "@shareride/contracts";
import type { Database } from "@shareride/db";
import type { MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { toOpenApiRoute } from "../../openapi.ts";
import type { Co2SettingsSource } from "./figures.ts";
import { co2TotalsOf, co2TotalsView } from "./totals.ts";

/** My own CO2 totals (spec 34, 3.8): only the signed-in member's. */
export function registerCo2Routes(
  app: OpenAPIHono<AppEnv>,
  dependencies: { readonly db: Database; readonly co2Settings: Co2SettingsSource },
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(myCo2Route, requireAuth), async (c) => {
    const [totals, { gramsPerCarKm }] = await Promise.all([
      co2TotalsOf(dependencies.db, authOf(c).userId),
      dependencies.co2Settings(),
    ]);
    return c.json(co2TotalsView(totals, gramsPerCarKm), 200);
  });
}
