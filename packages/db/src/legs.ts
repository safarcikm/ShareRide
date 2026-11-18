import { sql } from "drizzle-orm";
import type { Database } from "./index.ts";

/**
 * One writer of legs at a time, for the rest of the transaction: the API's
 * leg service and the sample seed, so two never insert the same leg.
 */
export async function lockLegs(tx: Pick<Database, "execute">): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('shareride.legs'))`);
}
