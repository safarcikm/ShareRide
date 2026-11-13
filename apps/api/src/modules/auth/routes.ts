import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  endSessionRoute,
  listSessionsRoute,
  refreshRoute,
  signOutRoute,
  startPhoneSignInRoute,
  verifyPhoneCodeRoute,
} from "@shareride/contracts";
import { sessionRules } from "@shareride/domain";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { AccountService } from "../account/index.ts";
import type { IssuedTokens, Platform, StartError, VerifyError } from "./service.ts";
import type { AuthService } from "./service.ts";

/** The web's refresh token cookie, sent only to the sign-in endpoints (ADR 0016). */
export const refreshCookie = { name: "sr_refresh", path: "/v1/auth" } as const;

export interface AuthRoutesDependencies {
  readonly auth: AuthService;
  readonly account: AccountService;
  readonly requireAuth: MiddlewareHandler;
  readonly clientAddress: (c: Context) => string;
  /** Secure cookies need HTTPS: on in production, off for http://localhost. */
  readonly secureCookies: boolean;
}

const messages: Record<StartError["code"] | VerifyError["code"], string> = {
  phone_invalid: "The phone number is not a valid mobile number.",
  phone_country_unsupported: "Phone numbers from this country are not supported yet.",
  rate_limited: "Too many codes were asked for. Try again later.",
  sms_failed: "The SMS could not be sent. Try again.",
  code_invalid: "The code is wrong.",
  code_expired: "The code has expired or was used. Ask for a new one.",
  code_attempts_exceeded: "Too many wrong codes. Ask for a new one.",
  account_unavailable: "This account cannot sign in.",
};

function signInError(c: Context, error: StartError | VerifyError) {
  const message = messages[error.code];
  switch (error.code) {
    case "rate_limited":
    case "code_attempts_exceeded":
      return errorResponse(c, 429, error.code, message, {
        retryAfterSeconds: error.retryAfterSeconds,
      });
    case "code_invalid":
      return errorResponse(c, 400, error.code, message, { attemptsLeft: error.attemptsLeft });
    case "sms_failed":
      return errorResponse(c, 502, error.code, message);
    case "account_unavailable":
      return errorResponse(c, 403, error.code, message);
    default:
      return errorResponse(c, 400, error.code, message);
  }
}

export function registerAuthRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: AuthRoutesDependencies,
): void {
  const { auth, account, requireAuth, clientAddress, secureCookies } = dependencies;

  /** The tokens for the body; on the web the refresh token goes in the cookie instead. */
  function tokensBody(c: Context, tokens: IssuedTokens, platform: Platform) {
    const body = {
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt.toISOString(),
    };
    if (platform !== "web") return { ...body, refreshToken: tokens.refreshToken };
    setCookie(c, refreshCookie.name, tokens.refreshToken, {
      path: refreshCookie.path,
      httpOnly: true,
      secure: secureCookies,
      sameSite: "Strict",
      maxAge: sessionRules.refreshTokenIdleSeconds,
    });
    return body;
  }

  function clearRefreshCookie(c: Context): void {
    deleteCookie(c, refreshCookie.name, {
      path: refreshCookie.path,
      httpOnly: true,
      secure: secureCookies,
      sameSite: "Strict",
    });
  }

  app.openapi(toOpenApiRoute(startPhoneSignInRoute), async (c) => {
    const body = validated(c, "json", startPhoneSignInRoute.request.body);
    const result = await auth.start({ ...body, ipAddress: clientAddress(c) });
    if (!result.ok) return signInError(c, result.error);
    return c.json(result.value, 202);
  });

  app.openapi(toOpenApiRoute(verifyPhoneCodeRoute), async (c) => {
    const body = validated(c, "json", verifyPhoneCodeRoute.request.body);
    const result = await auth.verify(body);
    if (!result.ok) return signInError(c, result.error);
    const { userId, tokens, platform, isNewUser } = result.value;
    const user = await account.me(userId);
    return c.json({ ...tokensBody(c, tokens, platform), user, isNewUser }, 200);
  });

  app.openapi(toOpenApiRoute(refreshRoute), async (c) => {
    const body = validated(c, "json", refreshRoute.request.body);
    const token = body.refreshToken ?? getCookie(c, refreshCookie.name);
    if (token === undefined) {
      return errorResponse(c, 401, "refresh_invalid", "No refresh token was sent.");
    }
    const result = await auth.refresh(token);
    if (!result.ok) {
      if (body.refreshToken === undefined) clearRefreshCookie(c);
      const message =
        result.error.code === "session_ended"
          ? "This session has ended. Sign in again."
          : "The refresh token is not valid. Sign in again.";
      return errorResponse(c, 401, result.error.code, message);
    }
    return c.json(tokensBody(c, result.value.tokens, result.value.platform), 200);
  });

  app.openapi(toOpenApiRoute(signOutRoute, requireAuth), async (c) => {
    const body = validated(c, "json", signOutRoute.request.body);
    await auth.signOut({ ...authOf(c), all: body.all === true });
    clearRefreshCookie(c);
    return c.body(null, 204);
  });

  app.openapi(toOpenApiRoute(listSessionsRoute, requireAuth), async (c) => {
    const { userId, sessionId } = authOf(c);
    const sessions = await auth.listSessions(userId);
    return c.json(
      {
        sessions: sessions.map((session) => ({
          ...session,
          createdAt: session.createdAt.toISOString(),
          lastActiveAt: session.lastActiveAt.toISOString(),
          current: session.id === sessionId,
        })),
      },
      200,
    );
  });

  app.openapi(toOpenApiRoute(endSessionRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", endSessionRoute.request.params);
    const ended = await auth.endSession(authOf(c).userId, id);
    if (!ended) return errorResponse(c, 404, "not_found", "There is no such signed-in device.");
    return c.body(null, 204);
  });
}
