import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import type { AuthService } from "./service.ts";

const bearer = /^Bearer ([A-Za-z0-9_-]{1,200})$/;

/** Lets a request through only with a valid access token, and records who made it. */
export function createRequireAuth(auth: AuthService): MiddlewareHandler<AppEnv> {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = bearer.exec(c.req.header("authorization") ?? "")?.[1];
    const session = token === undefined ? null : await auth.authenticate(token);
    if (session === null) {
      c.header("WWW-Authenticate", 'Bearer realm="shareride"');
      return errorResponse(c, 401, "unauthenticated", "Sign in first.");
    }
    c.set("auth", session);
    await next();
    return undefined;
  });
}

/**
 * For routes anyone can use: records who made the request when it carries a
 * valid access token. A token that is not valid gets 401, as with
 * `requireAuth`, so the app refreshes it instead of silently searching as
 * nobody.
 */
export function createOptionalAuth(auth: AuthService): MiddlewareHandler<AppEnv> {
  return createMiddleware<AppEnv>(async (c, next) => {
    const header = c.req.header("authorization");
    if (header === undefined) {
      await next();
      return undefined;
    }
    const token = bearer.exec(header)?.[1];
    const session = token === undefined ? null : await auth.authenticate(token);
    if (session === null) {
      c.header("WWW-Authenticate", 'Bearer realm="shareride"');
      return errorResponse(c, 401, "unauthenticated", "Sign in again, or search without a token.");
    }
    c.set("auth", session);
    await next();
    return undefined;
  });
}
