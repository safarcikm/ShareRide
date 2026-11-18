import type { OpenAPIHono } from "@hono/zod-openapi";
import { checkInviteCodeRoute } from "@shareride/contracts";
import type { InviteCodeProblem } from "@shareride/domain";
import type { Context } from "hono";
import type { AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { RateLimiter } from "../../platform/memory-rate-limiter.ts";
import type { InviteService } from "./invites.ts";

export interface InviteRoutesDependencies {
  readonly invites: InviteService;
  readonly limiter: RateLimiter;
  /** What the limit counts by: a keyed hash of the caller's address block. */
  readonly clientKey: (c: Context) => string;
}

export const inviteProblemMessages: Record<InviteCodeProblem["code"], string> = {
  invite_invalid: "This invite code is not valid or has expired.",
  beta_full: "The beta is full for now.",
};

/** The answer to an invite code that does not work. */
export function inviteProblem(c: Context, problem: InviteCodeProblem) {
  return errorResponse(
    c,
    problem.code === "beta_full" ? 409 : 400,
    problem.code,
    inviteProblemMessages[problem.code],
  );
}

/** `POST /v1/invites/check`, open to everyone (spec 12, section 6). */
export function registerInviteRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: InviteRoutesDependencies,
): void {
  const { invites, limiter, clientKey } = dependencies;

  app.openapi(toOpenApiRoute(checkInviteCodeRoute), async (c) => {
    const limit = limiter.hit(clientKey(c));
    if (!limit.ok) {
      return errorResponse(c, 429, "rate_limited", "Too many tries. Try again shortly.", {
        retryAfterSeconds: limit.error.retryAfterSeconds,
      });
    }
    const { code } = validated(c, "json", checkInviteCodeRoute.request.body);
    const checked = await invites.check(code);
    if (!checked.ok) return inviteProblem(c, checked.error);
    return c.json({ valid: true as const }, 200);
  });
}
