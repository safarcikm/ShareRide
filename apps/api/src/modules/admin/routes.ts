import type { OpenAPIHono } from "@hono/zod-openapi";
import { adminAuditLogRoute, adminMeRoute, adminSignOutRoute } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import { auditLogPageSize, auditLogPeriod } from "@shareride/domain";
import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { operatorOf, type AppEnv } from "../../context.ts";
import { errorBody } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
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

/** The console's own routes: who is signed in, signing out (ADR 0028), and the audit log. */
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

  // Read only: no route changes or deletes an entry (spec 9, 3.8).
  app.openapi(toOpenApiRoute(adminAuditLogRoute, requireOperator), async (c) => {
    const query = validated(c, "query", adminAuditLogRoute.request.query);
    if (query.from !== undefined && query.to !== undefined && query.to < query.from) {
      return c.json(
        errorBody("validation_failed", "The request is not valid.", [
          { path: "to", issue: "before_from" },
        ]),
        400,
      );
    }
    const log = schema.auditLog;
    const { from, until } = auditLogPeriod(query);
    const conditions: (SQL | undefined)[] = [
      query.action === undefined ? undefined : sql`starts_with(${log.action}, ${query.action})`,
      query.subjectType === undefined ? undefined : eq(log.subjectType, query.subjectType),
      query.subjectId === undefined ? undefined : eq(log.subjectId, query.subjectId),
      query.operatorUserId === undefined ? undefined : eq(log.operatorUserId, query.operatorUserId),
      from === undefined ? undefined : gte(log.createdAt, from),
      until === undefined ? undefined : lt(log.createdAt, until),
    ];
    if (query.before !== undefined) {
      const [before] = await db.select({ id: log.id }).from(log).where(eq(log.id, query.before));
      if (before === undefined) {
        return c.json(errorBody("not_found", "No such audit log entry."), 404);
      }
      // Compared in the database: its times have microseconds, a JavaScript
      // date only milliseconds, and entries of one transaction share a time.
      conditions.push(
        sql`(${log.createdAt}, ${log.id}) < (select created_at, id from audit_log where id = ${before.id})`,
      );
    }
    const rows = await db
      .select({
        id: log.id,
        at: log.createdAt,
        operatorUserId: log.operatorUserId,
        firstName: schema.users.firstName,
        sessionId: log.operatorSessionId,
        action: log.action,
        subjectType: log.subjectType,
        subjectId: log.subjectId,
        before: log.before,
        after: log.after,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
      })
      .from(log)
      .leftJoin(schema.users, eq(schema.users.id, log.operatorUserId))
      .where(and(...conditions))
      .orderBy(desc(log.createdAt), desc(log.id))
      .limit(auditLogPageSize + 1);
    const page = rows.slice(0, auditLogPageSize);
    return c.json(
      {
        entries: page.map((row) => ({
          id: row.id,
          at: row.at.toISOString(),
          operator: { userId: row.operatorUserId, firstName: row.firstName },
          byCommand: row.sessionId === null,
          action: row.action,
          subjectType: row.subjectType,
          subjectId: row.subjectId,
          before: row.before,
          after: row.after,
          ipAddress: row.ipAddress,
          userAgent: row.userAgent,
        })),
        hasMore: rows.length > auditLogPageSize,
      },
      200,
    );
  });
}
