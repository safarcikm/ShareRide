import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  adminDecideDisputeRoute,
  adminDisputeConversationRoute,
  adminDisputeRoute,
  adminDisputesRoute,
} from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { operatorOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { auditRequestOf } from "../admin/audit.ts";
import type { ConsoleActor, DisputeAdminService } from "./admin.ts";

export interface DisputeAdminRoutesDependencies {
  readonly disputes: DisputeAdminService;
  readonly requireOperator: MiddlewareHandler<AppEnv>;
  readonly clientAddress: (c: Context) => string;
}

const noSuchReport = (c: Context) => errorResponse(c, 404, "not_found", "There is no such report.");

/** The console's dispute routes under /admin/v1 (spec 8, 3.5). */
export function registerDisputeAdminRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: DisputeAdminRoutesDependencies,
): void {
  const { disputes, requireOperator, clientAddress } = dependencies;
  const actorOf = (c: Context<AppEnv>): ConsoleActor => {
    const { userId, sessionId } = operatorOf(c);
    return { operator: { userId, sessionId }, request: auditRequestOf(c, clientAddress) };
  };

  app.openapi(toOpenApiRoute(adminDisputesRoute, requireOperator), async (c) => {
    const { state } = validated(c, "query", adminDisputesRoute.request.query);
    return c.json({ disputes: await disputes.list(state) }, 200);
  });

  app.openapi(toOpenApiRoute(adminDisputeRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminDisputeRoute.request.params);
    const dispute = await disputes.get(id);
    if (dispute === undefined) return noSuchReport(c);
    return c.json(dispute, 200);
  });

  app.openapi(toOpenApiRoute(adminDecideDisputeRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminDecideDisputeRoute.request.params);
    const body = validated(c, "json", adminDecideDisputeRoute.request.body);
    const decided = await disputes.decide(id, body, actorOf(c));
    if (decided.ok) return c.json(decided.value, 200);
    const problem = decided.error;
    switch (problem.code) {
      case "not_found":
        return noSuchReport(c);
      case "note_too_long":
        return errorResponse(c, 400, "validation_failed", "The note is too long.", {
          details: [{ path: "note", issue: "too_long" }],
        });
      case "not_contested":
        return errorResponse(c, 409, problem.code, "Only a contested report is decided here.");
      case "already_decided":
        return errorResponse(c, 409, problem.code, "The report is already decided.");
      case "outcome_invalid":
        return errorResponse(c, 409, problem.code, "That outcome is not one for this report.");
    }
  });

  app.openapi(toOpenApiRoute(adminDisputeConversationRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminDisputeConversationRoute.request.params);
    const read = await disputes.conversation(id, actorOf(c));
    if (read.ok) return c.json({ messages: [...read.value] }, 200);
    if (read.error.code === "not_found") return noSuchReport(c);
    return errorResponse(
      c,
      409,
      "not_contested",
      "The conversation opens only for a report the other side contested.",
    );
  });
}
