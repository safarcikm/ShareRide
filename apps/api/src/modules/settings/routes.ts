import type { OpenAPIHono } from "@hono/zod-openapi";
import { configRoute } from "@shareride/contracts";
import { pausedNow } from "@shareride/domain";
import type { AppEnv } from "../../context.ts";
import { toOpenApiRoute } from "../../openapi.ts";
import type { SettingsService } from "./service.ts";

/** How long the apps and anything between may keep the answer (spec 10, section 6). */
export const configMaxAgeSeconds = 300;

/** `GET /v1/config`: the operator's settings the apps need, open to everyone. */
export function registerConfigRoutes(app: OpenAPIHono<AppEnv>, settings: SettingsService): void {
  app.openapi(toOpenApiRoute(configRoute), async (c) => {
    const { values } = await settings.current();
    c.header("Cache-Control", `public, max-age=${String(configMaxAgeSeconds)}`);
    return c.json(
      {
        maxSeats: values.max_capacity,
        freeCancellationMinutes: values.free_cancellation_until,
        maxMoveMinutes: values.max_time_change,
        reliabilityMonths: values.reliability_period,
        // The beta is open to everyone (ADR 0035): the label shows until
        // launch, whether or not the operator asks for invite codes.
        beta: true,
        paused: pausedNow(values),
      },
      200,
    );
  });
}
