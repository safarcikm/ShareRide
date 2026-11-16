import type { Context } from "hono";
import type { RequestIdVariables } from "hono/request-id";

/** Who is calling, set by `requireAuth`. */
export interface AuthContext {
  readonly userId: string;
  readonly sessionId: string;
}

/** The signed-in operator, set by `requireOperator` on console routes (ADR 0028). */
export interface OperatorContext {
  readonly userId: string;
  readonly sessionId: string;
  /** When the console session ends unless it is used again before then. */
  readonly sessionEndsAt: Date;
}

export interface AppEnv {
  Variables: RequestIdVariables & { auth?: AuthContext; operator?: OperatorContext };
}

/** The caller of a route that has `requireAuth`. */
export function authOf(c: Context<AppEnv>): AuthContext {
  const auth = c.get("auth");
  if (auth === undefined) throw new Error("This route is missing requireAuth.");
  return auth;
}

/** The operator calling a console route that has `requireOperator`. */
export function operatorOf(c: Context<AppEnv>): OperatorContext {
  const operator = c.get("operator");
  if (operator === undefined) throw new Error("This route is missing requireOperator.");
  return operator;
}
