import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  adminChangeSettingRoute,
  adminPreviewSettingRoute,
  adminSettingsHistoryRoute,
  adminSettingsRoute,
  type AdminSettings,
} from "@shareride/contracts";
import {
  checkSettingValue,
  isPriceSettingKey,
  pricePreview,
  pricePreviewExample,
  settingDefinitions,
  settingKeys,
  type PricePreview,
  type SettingValueProblem,
} from "@shareride/domain";
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

const invalid = (c: Context, path: string, issue: string, message: string) =>
  errorResponse(c, 400, "validation_failed", message, { details: [{ path, issue }] });

/** Why a setting cannot take a value. */
function refusedValue(c: Context, problem: SettingValueProblem) {
  switch (problem.code) {
    case "unknown_setting":
      return errorResponse(c, 404, "not_found", "There is no such setting.");
    case "unchanged":
      return errorResponse(c, 409, "unchanged", "The setting has this value already.");
    case "not_a_step":
      return invalid(c, "value", "not_a_step", "The value is not one this setting takes.");
    case "out_of_range":
      return invalid(c, "value", "out_of_range", "The value is outside the setting's range.");
    case "suggested_over_cap":
      return invalid(
        c,
        "value",
        "suggested_over_cap",
        "The suggested rate times the seats and the driver must not be more than the reference cost.",
      );
  }
}

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
    const problem = changed.error;
    if (problem.code === "settings_changed") {
      return errorResponse(
        c,
        409,
        "settings_changed",
        "A setting was changed since you loaded them. Load them again.",
      );
    }
    if (problem.code === "reason_missing") return invalid(c, "reason", "missing", "Say why.");
    if (problem.code === "reason_too_long") {
      return invalid(c, "reason", "too_long", "The reason is too long.");
    }
    return refusedValue(c, problem);
  });

  // The effect before saving (spec 10, 3.2.2): nothing is stored or logged.
  app.openapi(toOpenApiRoute(adminPreviewSettingRoute, requireOperator), async (c) => {
    const { key } = validated(c, "param", adminPreviewSettingRoute.request.params);
    const { value } = validated(c, "json", adminPreviewSettingRoute.request.body);
    const { values } = await settings.latest();
    const checked = checkSettingValue(key, value, values);
    if (!checked.ok) return refusedValue(c, checked.error);
    if (!isPriceSettingKey(key)) return c.json({ price: null }, 200);
    const shown = (preview: PricePreview) => ({
      price: preview.price.amount,
      highestLevel: preview.highestLevel,
    });
    return c.json(
      {
        price: {
          distanceKm: pricePreviewExample.distanceM / 1000,
          seats: pricePreviewExample.seats,
          before: shown(pricePreview(values)),
          after: shown(pricePreview(checked.value.values)),
        },
      },
      200,
    );
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
