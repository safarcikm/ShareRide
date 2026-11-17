import { schema, type Database } from "@shareride/db";
import { operatorSessionRules } from "@shareride/domain";
import { and, lt, or } from "drizzle-orm";
import { notHeld } from "../privacy/holds.ts";

const { operatorChallenges, operatorSessions, operatorSetupLinks } = schema;

/**
 * Deletes console sessions 30 days after they ended, or after they could
 * last have worked (12 hours after sign-in), like the app's sessions,
 * unless a hold covers the operator (spec 11, 3.7.3). Safe to run at any
 * time; the hourly clean-up runs it.
 */
export async function cleanUpOperatorSessions(db: Database, now: Date): Promise<number> {
  const keepMs = operatorSessionRules.endedSessionRetentionDays * 24 * 3600 * 1000;
  const endedBefore = new Date(now.getTime() - keepMs);
  const startedBefore = new Date(endedBefore.getTime() - operatorSessionRules.maxSeconds * 1000);
  const deleted = await db
    .delete(operatorSessions)
    .where(
      and(
        or(
          lt(operatorSessions.endedAt, endedBefore),
          lt(operatorSessions.createdAt, startedBefore),
        ),
        notHeld(db, now, [["user", operatorSessions.userId]]),
      ),
    )
    .returning({ id: operatorSessions.id });
  return deleted.length;
}

/**
 * Deletes passkey challenges and setup links that can no longer be used:
 * a challenge 5 minutes after it was made, a link 30 minutes after.
 */
export async function cleanUpOperatorSignIn(db: Database, now: Date): Promise<number> {
  const challenges = await db
    .delete(operatorChallenges)
    .where(lt(operatorChallenges.expiresAt, now))
    .returning({ id: operatorChallenges.id });
  const links = await db
    .delete(operatorSetupLinks)
    .where(lt(operatorSetupLinks.expiresAt, now))
    .returning({ id: operatorSetupLinks.id });
  return challenges.length + links.length;
}
