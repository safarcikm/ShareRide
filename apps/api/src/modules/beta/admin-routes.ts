import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  adminCreateInviteCodeRoute,
  adminEndInviteCodeRoute,
  adminInviteCodesRoute,
  type AdminInviteCode,
} from "@shareride/contracts";
import type { GroupCodeProblem } from "@shareride/domain";
import type { Context, MiddlewareHandler } from "hono";
import { operatorOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { auditRequestOf } from "../admin/audit.ts";
import type { InviteCodeView, InviteService } from "./invites.ts";

export interface InviteAdminRoutesDependencies {
  readonly invites: InviteService;
  readonly requireOperator: MiddlewareHandler<AppEnv>;
  readonly clientAddress: (c: Context) => string;
}

const shown = (code: InviteCodeView): AdminInviteCode => ({
  ...code,
  expiresAt: code.expiresAt.toISOString(),
  endedAt: code.endedAt?.toISOString() ?? null,
  createdAt: code.createdAt.toISOString(),
});

const draftProblems: Record<
  GroupCodeProblem["code"],
  { readonly path: string; readonly issue: string; readonly message: string }
> = {
  name_missing: { path: "name", issue: "missing", message: "Give the code a name." },
  name_too_long: { path: "name", issue: "too_long", message: "The name is too long." },
  uses_out_of_range: {
    path: "uses",
    issue: "out_of_range",
    message: "A code takes 1 to 500 uses.",
  },
  end_in_past: { path: "expiresAt", issue: "in_past", message: "The end must be in the future." },
  end_too_far: {
    path: "expiresAt",
    issue: "too_far",
    message: "A code ends at most 12 months ahead.",
  },
};

/** The console's invite code routes under /admin/v1 (spec 12, 3.2 and section 6). */
export function registerInviteAdminRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: InviteAdminRoutesDependencies,
): void {
  const { invites, requireOperator, clientAddress } = dependencies;

  const by = (c: Context<AppEnv>) => {
    const { userId, sessionId } = operatorOf(c);
    return { operator: { userId, sessionId }, request: auditRequestOf(c, clientAddress) };
  };

  app.openapi(toOpenApiRoute(adminInviteCodesRoute, requireOperator), async (c) => {
    const overview = await invites.overview();
    return c.json({ ...overview, codes: overview.codes.map(shown) }, 200);
  });

  app.openapi(toOpenApiRoute(adminCreateInviteCodeRoute, requireOperator), async (c) => {
    const body = validated(c, "json", adminCreateInviteCodeRoute.request.body);
    const made = await invites.create({ ...body, expiresAt: new Date(body.expiresAt) }, by(c));
    if (!made.ok) {
      const { path, issue, message } = draftProblems[made.error.code];
      return errorResponse(c, 400, "validation_failed", message, { details: [{ path, issue }] });
    }
    return c.json(shown(made.value), 201);
  });

  app.openapi(toOpenApiRoute(adminEndInviteCodeRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminEndInviteCodeRoute.request.params);
    const ended = await invites.end(id, by(c));
    if (!ended.ok) {
      return ended.error.code === "not_found"
        ? errorResponse(c, 404, "not_found", "There is no such invite code.")
        : errorResponse(c, 409, "already_ended", "This code has ended already.");
    }
    return c.json(shown(ended.value), 200);
  });
}
