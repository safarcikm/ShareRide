import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  askAboutMyDataRoute,
  askDataExportRoute,
  cancelDeletionRoute,
  dataExportLinkRoute,
  deleteAccountRoute,
  deletionCheckRoute,
  downloadDataExportRoute,
  getDataExportRoute,
  type DataExport,
  type DeletionCheck,
  type OpenItem as OpenItemBody,
} from "@shareride/contracts";
import type { MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { AccountService } from "../account/service.ts";
import { confirmCodeError } from "../auth/routes.ts";
import type { DeletionCheckResult, DeletionService, OpenItem } from "./deletion.ts";
import type { ExportService, ExportStatus } from "./exports.ts";
import type { PrivacyRequests } from "./requests.ts";

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

function openItemBody(item: OpenItem): OpenItemBody {
  switch (item.kind) {
    case "trip":
      return { ...item, departsAt: item.departsAt.toISOString() };
    case "booking":
    case "request":
      return { ...item, boardsAt: item.boardsAt.toISOString() };
    case "trip_under_way":
      return { ...item, completesAt: item.completesAt.toISOString() };
    case "dispute":
    case "held_payout":
      return item;
  }
}

function checkBody(check: DeletionCheckResult): DeletionCheck {
  return {
    allowed: check.allowed,
    mustSettle: check.mustSettle.map(openItemBody),
    canCancel: check.canCancel.map(openItemBody),
  };
}

export interface PrivacyRoutesDependencies {
  readonly exports: ExportService;
  readonly deletion: DeletionService;
  readonly account: Pick<AccountService, "me">;
  readonly requests: Pick<PrivacyRequests, "ask">;
  readonly requireAuth: MiddlewareHandler;
}

export function registerPrivacyRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: PrivacyRoutesDependencies,
): void {
  const { exports, deletion, account, requests, requireAuth } = dependencies;

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

  app.openapi(toOpenApiRoute(deletionCheckRoute, requireAuth), async (c) => {
    return c.json(checkBody(await deletion.check(authOf(c).userId)), 200);
  });

  app.openapi(toOpenApiRoute(deleteAccountRoute, requireAuth), async (c) => {
    const { code } = validated(c, "json", deleteAccountRoute.request.body);
    const result = await deletion.schedule(authOf(c).userId, code);
    if (!result.ok) {
      if (result.error.code === "deletion_blocked") {
        return errorResponse(
          c,
          409,
          "deletion_blocked",
          "Something is still open; see GET /v1/me/deletion-check.",
        );
      }
      return confirmCodeError(c, result.error);
    }
    return c.json({ deleteAfter: result.value.deleteAfter.toISOString() }, 202);
  });

  app.openapi(toOpenApiRoute(askAboutMyDataRoute, requireAuth), async (c) => {
    const body = validated(c, "json", askAboutMyDataRoute.request.body);
    const result = await requests.ask(authOf(c).userId, body);
    if (!result.ok) {
      switch (result.error.code) {
        case "request_text_invalid":
          return errorResponse(c, 400, result.error.code, "Write 1 to 2 000 characters.");
        case "email_required":
          return errorResponse(
            c,
            409,
            result.error.code,
            "The answer goes by email: add and verify one first.",
          );
        case "rate_limited":
          return errorResponse(c, 429, result.error.code, "Five requests a day at most.", {
            retryAfterSeconds: result.error.retryAfterSeconds,
          });
      }
    }
    const request = result.value;
    return c.json(
      {
        id: request.id,
        kind: request.kind,
        receivedAt: request.receivedAt.toISOString(),
        dueAt: request.dueAt.toISOString(),
      },
      201,
    );
  });

  app.openapi(toOpenApiRoute(cancelDeletionRoute, requireAuth), async (c) => {
    validated(c, "json", cancelDeletionRoute.request.body);
    const { userId } = authOf(c);
    await deletion.cancel(userId);
    return c.json(await account.me(userId), 200);
  });
}
