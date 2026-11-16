import type { OpenAPIHono } from "@hono/zod-openapi";
import { adminMeRoute, adminSignOutRoute } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { operatorOf, type AppEnv } from "../../context.ts";
import { toOpenApiRoute } from "../../openapi.ts";
import { auditRequestOf, recordAudit } from "./audit.ts";
import { clearOperatorCookie } from "./require-operator.ts";
import type { OperatorSessionService } from "./sessions.ts";

export interface AdminRoutesDependencies {
  readonly db: Database;
  readonly sessions: OperatorSessionService;
  readonly requireOperator: MiddlewareHandler<AppEnv>;
  readonly clientAddress: (c: Context) => string;
  readonly secureCookies: boolean;
}

/** The console's own routes: who is signed in, and signing out (ADR 0028). */
export function registerAdminRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: AdminRoutesDependencies,
): void {
  const { db, sessions, requireOperator, clientAddress, secureCookies } = dependencies;

  app.openapi(toOpenApiRoute(adminMeRoute, requireOperator), async (c) => {
    const operator = operatorOf(c);
    const [user] = await db
      .select({ firstName: schema.users.firstName, locale: schema.users.locale })
      .from(schema.users)
      .where(eq(schema.users.id, operator.userId));
    if (user === undefined) throw new Error("The operator's account is missing.");
    return c.json(
      {
        userId: operator.userId,
        firstName: user.firstName,
        locale: user.locale === "is" ? ("is" as const) : ("en" as const),
        sessionEndsAt: operator.sessionEndsAt.toISOString(),
      },
      200,
    );
  });

  app.openapi(toOpenApiRoute(adminSignOutRoute, requireOperator), async (c) => {
    const operator = operatorOf(c);
    await db.transaction(async (tx) => {
      await recordAudit(tx, {
        operator,
        action: "operator.signed_out",
        subjectType: "operator_session",
        subjectId: operator.sessionId,
        request: auditRequestOf(c, clientAddress),
      });
      await sessions.end(operator.sessionId, "signed_out", tx);
    });
    clearOperatorCookie(c, secureCookies);
    return c.body(null, 204);
  });
}
