import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { operatorSessionRules } from "@shareride/domain";
import type { AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import type { OperatorSessionService } from "./sessions.ts";

/**
 * The console's session cookie (ADR 0028). Sent only to /admin/v1, never
 * readable by scripts, and never sent from another site.
 */
export const operatorCookie = { name: "sr_operator", path: "/admin/v1" } as const;

/** The console's routes; everything under it needs an operator except signing in. */
export const adminPrefix = "/admin/v1";

/**
 * The only console routes open without a session, as `METHOD path`: the
 * ones that sign in, with a passkey or the temporary password (ADR 0041).
 * Everything else under /admin/v1 is closed, including paths no route
 * matches.
 */
export const openAdminRoutes: ReadonlySet<string> = new Set<string>([
  "POST /admin/v1/auth/setup/options",
  "POST /admin/v1/auth/setup",
  "POST /admin/v1/auth/sign-in/options",
  "POST /admin/v1/auth/sign-in",
  "GET /admin/v1/auth/methods",
  "POST /admin/v1/auth/password",
]);

export function setOperatorCookie(c: Context, token: string, secure: boolean): void {
  setCookie(c, operatorCookie.name, token, {
    path: operatorCookie.path,
    httpOnly: true,
    secure,
    sameSite: "Strict",
    // The browser forgets it when the session can no longer work anyway.
    maxAge: operatorSessionRules.maxSeconds,
  });
}

export function clearOperatorCookie(c: Context, secure: boolean): void {
  deleteCookie(c, operatorCookie.name, {
    path: operatorCookie.path,
    httpOnly: true,
    secure,
    sameSite: "Strict",
  });
}

/**
 * Lets a request through only with a live console session of an active
 * operator, and records who it is in `c.var.operator`. A bearer token from
 * the app is never accepted here. Running it twice on one request checks
 * the session once.
 */
export function createRequireOperator(
  sessions: OperatorSessionService,
  secureCookies: boolean,
): MiddlewareHandler<AppEnv> {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (c.get("operator") !== undefined) {
      await next();
      return undefined;
    }
    const token = getCookie(c, operatorCookie.name);
    const operator =
      token === undefined || !/^[A-Za-z0-9_-]{1,200}$/.test(token)
        ? null
        : await sessions.authenticate(token);
    if (operator === null) {
      if (token !== undefined) clearOperatorCookie(c, secureCookies);
      return errorResponse(c, 401, "operator_unauthenticated", "Sign in to the console first.");
    }
    c.set("operator", operator);
    await next();
    return undefined;
  });
}

/**
 * Guards the whole console API, so a route added without its own guard is
 * still closed; only `openAdminRoutes` stay open. It covers only routes
 * registered after it, so it comes first in `createApp`.
 */
export function guardAdminPaths(
  requireOperator: MiddlewareHandler<AppEnv>,
  open: ReadonlySet<string> = openAdminRoutes,
) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const path = c.req.path;
    const isAdmin = path === adminPrefix || path.startsWith(`${adminPrefix}/`);
    if (!isAdmin || open.has(`${c.req.method} ${path}`)) {
      await next();
      return undefined;
    }
    return requireOperator(c, next);
  });
}
