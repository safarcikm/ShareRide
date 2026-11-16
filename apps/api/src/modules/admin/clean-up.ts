import { schema, type Database } from "@shareride/db";
import { operatorSessionRules } from "@shareride/domain";
import { lt, or } from "drizzle-orm";

const { operatorSessions } = schema;

/**
 * Deletes console sessions 30 days after they ended, or after they could
 * last have worked (12 hours after sign-in), like the app's sessions.
 * Safe to run at any time; the hourly clean-up runs it.
 */
export async function cleanUpOperatorSessions(db: Database, now: Date): Promise<number> {
  const keepMs = operatorSessionRules.endedSessionRetentionDays * 24 * 3600 * 1000;
  const endedBefore = new Date(now.getTime() - keepMs);
  const startedBefore = new Date(endedBefore.getTime() - operatorSessionRules.maxSeconds * 1000);
  const deleted = await db
    .delete(operatorSessions)
    .where(
      or(lt(operatorSessions.endedAt, endedBefore), lt(operatorSessions.createdAt, startedBefore)),
    )
    .returning({ id: operatorSessions.id });
  return deleted.length;
}
