import { schema } from "@shareride/db";
import { and, count, eq, gte } from "drizzle-orm";
import type { Database } from "@shareride/db";

const { notificationDeliveries } = schema;

/** How many sends on a channel were given up as failed since `since` (spec 7, 3.7). */
export async function failedDeliveriesSince(db: Database, since: Date): Promise<number> {
  const [row] = await db
    .select({ failed: count() })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.status, "failed"),
        gte(notificationDeliveries.updatedAt, since),
      ),
    );
  return row?.failed ?? 0;
}
