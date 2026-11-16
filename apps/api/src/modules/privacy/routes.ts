import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  askDataExportRoute,
  dataExportLinkRoute,
  downloadDataExportRoute,
  getDataExportRoute,
  type DataExport,
} from "@shareride/contracts";
import type { MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { confirmCodeError } from "../auth/routes.ts";
import type { ExportService, ExportStatus } from "./exports.ts";

const iso = (moment: Date | null) => (moment === null ? null : moment.toISOString());

function exportBody(status: ExportStatus): DataExport {
  switch (status.state) {
    case "none":
      return { state: "none" };
    case "preparing":
    case "failed":
      return {
        state: status.state,
        askedAt: status.askedAt.toISOString(),
        nextAllowedAt: iso(status.nextAllowedAt),
      };
    case "ready":
    case "expired":
      return {
        state: status.state,
        askedAt: status.askedAt.toISOString(),
        readyAt: status.readyAt.toISOString(),
        expiresAt: status.expiresAt.toISOString(),
        byteSize: status.byteSize,
        nextAllowedAt: iso(status.nextAllowedAt),
      };
  }
}

export function registerPrivacyRoutes(
  app: OpenAPIHono<AppEnv>,
  exports: ExportService,
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(askDataExportRoute, requireAuth), async (c) => {
    const { code } = validated(c, "json", askDataExportRoute.request.body);
    const result = await exports.ask(authOf(c).userId, code);
    if (!result.ok) {
      if (result.error.code === "export_too_soon") {
        return errorResponse(c, 429, "export_too_soon", "You can ask for one file a day.", {
          retryAfterSeconds: result.error.retryAfterSeconds,
        });
      }
      return confirmCodeError(c, result.error);
    }
    return c.json(exportBody(result.value), 202);
  });

  app.openapi(toOpenApiRoute(getDataExportRoute, requireAuth), async (c) => {
    return c.json(exportBody(await exports.status(authOf(c).userId)), 200);
  });

  app.openapi(toOpenApiRoute(dataExportLinkRoute, requireAuth), async (c) => {
    validated(c, "json", dataExportLinkRoute.request.body);
    const result = await exports.link(authOf(c).userId);
    if (!result.ok) {
      return errorResponse(c, 409, result.error.code, "There is no file ready to download.");
    }
    return c.json(
      { path: result.value.path, expiresAt: result.value.expiresAt.toISOString() },
      200,
    );
  });

  // No sign-in: the one-time link is the key, so a phone's browser can open it.
  app.openapi(toOpenApiRoute(downloadDataExportRoute), async (c) => {
    const { token } = validated(c, "param", downloadDataExportRoute.request.params);
    c.header("Cache-Control", "no-store");
    const gone = () =>
      errorResponse(c, 404, "not_found", "This link has been used or has expired.");
    const attachment = (filename: string) => {
      c.header("Content-Type", "application/zip");
      c.header("Content-Disposition", `attachment; filename="${filename}"`);
    };
    // A browser or download manager may look first: that leaves the link unused.
    if (c.req.method === "HEAD") {
      const info = await exports.peek(token);
      if (info === undefined) return gone();
      attachment(info.filename);
      c.header("Content-Length", String(info.byteSize));
      return c.body(null, 200);
    }
    const file = await exports.download(token);
    if (file === undefined) return gone();
    attachment(file.filename);
    return c.body(new Uint8Array(file.zip), 200);
  });
}
