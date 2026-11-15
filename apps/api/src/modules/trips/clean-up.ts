import { schema, type Database } from "@shareride/db";
import { draftRetentionDays } from "@shareride/domain";
import { and, eq, lt, or } from "drizzle-orm";

const { trips } = schema;

/**
 * Deletes drafts 30 days after their last change, or once their departure
 * has passed (R3.11), with their stops. Returns how many went.
 */
export async function cleanUpDrafts(db: Database, now: Date): Promise<number> {
  const unchangedSince = new Date(now.getTime() - draftRetentionDays * 24 * 3600 * 1000);
  const deleted = await db
    .delete(trips)
    .where(
      and(
        eq(trips.status, "draft"),
        or(lt(trips.updatedAt, unchangedSince), lt(trips.departsAt, now)),
      ),
    )
    .returning({ id: trips.id });
  return deleted.length;
}
