import type { Context } from "hono";
import type { RequestIdVariables } from "hono/request-id";

/** Who is calling, set by `requireAuth`. */
export interface AuthContext {
  readonly userId: string;
  readonly sessionId: string;
}

export interface AppEnv {
  Variables: RequestIdVariables & { auth?: AuthContext };
}

/** The caller of a route that has `requireAuth`. */
export function authOf(c: Context<AppEnv>): AuthContext {
  const auth = c.get("auth");
  if (auth === undefined) throw new Error("This route is missing requireAuth.");
  return auth;
}
