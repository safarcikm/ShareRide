import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  adminOwnEmailsRoute,
  adminSetOwnEmailsRoute,
  type AdminOwnEmails,
} from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { operatorOf, type AppEnv } from "../../context.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { newMembersSinceOf, setNewMembersEmail } from "./new-members.ts";

const { users } = schema;

/** The operator's confirmed address, where their emails go; null without one. */
async function addressOf(db: Database, userId: string): Promise<string | null> {
  const [user] = await db
    .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId));
  return user === undefined || user.emailVerifiedAt === null ? null : user.email;
}

/**
 * The console's Emails to you (spec 25): the signed-in operator's own
 * choices. Not in the audit log: they change nothing for anyone else.
 */
export function registerOwnEmailAdminRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: {
    readonly db: Database;
    readonly clock: () => Date;
    readonly requireOperator: MiddlewareHandler<AppEnv>;
  },
): void {
  const { db, clock, requireOperator } = dependencies;

  app.openapi(toOpenApiRoute(adminOwnEmailsRoute, requireOperator), async (c) => {
    const { userId } = operatorOf(c);
    const answer: AdminOwnEmails = {
      newMembers: (await newMembersSinceOf(db, userId)) !== null,
      address: await addressOf(db, userId),
    };
    return c.json(answer, 200);
  });

  app.openapi(toOpenApiRoute(adminSetOwnEmailsRoute, requireOperator), async (c) => {
    const { userId } = operatorOf(c);
    const { newMembers } = validated(c, "json", adminSetOwnEmailsRoute.request.body);
    const since = await setNewMembersEmail(db, userId, newMembers, clock());
    const answer: AdminOwnEmails = {
      newMembers: since !== null,
      address: await addressOf(db, userId),
    };
    return c.json(answer, 200);
  });
}
