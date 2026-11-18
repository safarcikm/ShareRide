import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  adminChangeSettingRoute,
  adminSettingsHistoryRoute,
  adminSettingsRoute,
  type AdminSettings,
} from "@shareride/contracts";
import { settingDefinitions, settingKeys } from "@shareride/domain";
import type { Context, MiddlewareHandler } from "hono";
import { operatorOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { auditRequestOf } from "../admin/audit.ts";
import type { SettingsService, SettingsSnapshot } from "./service.ts";

export interface SettingsAdminRoutesDependencies {
  readonly settings: SettingsService;
  readonly requireOperator: MiddlewareHandler<AppEnv>;
  readonly clientAddress: (c: Context) => string;
}

/** Every setting of the catalogue, in its order, with its value at a version. */
const listed = ({ version, values }: SettingsSnapshot): AdminSettings => ({
  version,
  settings: settingKeys.map((key) => ({ key, ...settingDefinitions[key], value: values[key] })),
});

/** The console's Settings routes under /admin/v1 (spec 10, 3.2; ADR 0032). */
export function registerSettingsAdminRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: SettingsAdminRoutesDependencies,
): void {
  const { settings, requireOperator, clientAddress } = dependencies;

  // The page a change is made on must show what is saved, so it reads past the cache.
  app.openapi(toOpenApiRoute(adminSettingsRoute, requireOperator), async (c) => {
    return c.json(listed(await settings.latest()), 200);
  });

  app.openapi(toOpenApiRoute(adminChangeSettingRoute, requireOperator), async (c) => {
    const { key } = validated(c, "param", adminChangeSettingRoute.request.params);
    const body = validated(c, "json", adminChangeSettingRoute.request.body);
    const { userId, sessionId } = operatorOf(c);
    const changed = await settings.change(
      { key, ...body },
      { operator: { userId, sessionId }, request: auditRequestOf(c, clientAddress) },
    );
    if (changed.ok) return c.json(listed(changed.value), 200);
    const invalid = (path: string, issue: string, message: string) =>
      errorResponse(c, 400, "validation_failed", message, { details: [{ path, issue }] });
    const problem = changed.error;
    switch (problem.code) {
      case "unknown_setting":
        return errorResponse(c, 404, "not_found", "There is no such setting.");
      case "settings_changed":
        return errorResponse(
          c,
          409,
          "settings_changed",
          "A setting was changed since you loaded them. Load them again.",
        );
      case "unchanged":
        return errorResponse(c, 409, "unchanged", "The setting has this value already.");
      case "not_a_step":
        return invalid("value", "not_a_step", "The value is not one this setting takes.");
      case "out_of_range":
        return invalid("value", "out_of_range", "The value is outside the setting's range.");
      case "reason_missing":
        return invalid("reason", "missing", "Say why in a reason.");
      case "reason_too_long":
        return invalid("reason", "too_long", "The reason is too long.");
    }
  });

  app.openapi(toOpenApiRoute(adminSettingsHistoryRoute, requireOperator), async (c) => {
    const { before } = validated(c, "query", adminSettingsHistoryRoute.request.query);
    const { changes, next } = await settings.history(before);
    return c.json(
      {
        changes: changes.map((change) => ({
          ...change,
          changedAt: change.changedAt.toISOString(),
        })),
        next,
      },
      200,
    );
  });
}
