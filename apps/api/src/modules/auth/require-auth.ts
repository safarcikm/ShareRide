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
