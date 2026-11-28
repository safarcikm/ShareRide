// Apple's refresh tokens of Apple links that ended (spec 37, 3.2; ADR
// 0056): an erased account, or Apple removed or replaced on Sign-in methods.
// Each is queued in the transaction that ends the link, alone, with no
// account ID, and sent to Apple's revoke endpoint by the job
// `apple-revocations`, which the API runs every minute while Apple is on:
// the clean-up's erasure holds no Apple keys. The hourly clean-up drops a
// token still queued after 7 days. No token is ever logged (R37.3).
import { schema, type Database } from "@shareride/db";
import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import type { Logger } from "../../logger.ts";
import type { Queryable } from "../bookings/seats.ts";

const { appleTokensToRevoke, identities } = schema;

export const appleRevocationRules = {
  /** How long a run holds the tokens it took, so no other run sends them meanwhile. */
  leaseMs: 2 * 60_000,
  /** How long after Apple refused or could not be reached a token is sent again. */
  retryAfterMs: 10 * 60_000,
  /** Tokens one run sends. */
  batchSize: 50,
} as const;

/** Queues a link's token, when it has one, to be revoked from now. */
export async function queueAppleToken(
  q: Queryable,
  token: string | null | undefined,
  now: Date,
): Promise<void> {
  if (token === null || token === undefined) return;
  await q.insert(appleTokensToRevoke).values({ token, revokeAfter: now, queuedAt: now });
}

/** Queues the tokens of an account's Apple links, as its erasure begins. */
export async function queueAppleTokensOf(q: Queryable, userId: string, now: Date): Promise<void> {
  const links = await q
    .select({ token: identities.appleRefreshToken })
    .from(identities)
    .where(and(eq(identities.userId, userId), isNotNull(identities.appleRefreshToken)));
  for (const { token } of links) await queueAppleToken(q, token, now);
}

/**
 * The job: takes up to 50 due tokens, moving their time on by the lease,
 * then asks Apple to revoke each outside any transaction. A token Apple took
 * is deleted; one it refused, or that did not reach it, waits 10 minutes.
 */
export async function revokeDueAppleTokens(dependencies: {
  readonly db: Database;
  readonly revoke: (token: string) => Promise<boolean>;
  readonly now: Date;
  readonly logger: Logger;
}): Promise<{ readonly revoked: number; readonly refused: number }> {
  const { db, revoke, now, logger } = dependencies;
  const taken = await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: appleTokensToRevoke.id, token: appleTokensToRevoke.token })
      .from(appleTokensToRevoke)
      .where(lte(appleTokensToRevoke.revokeAfter, now))
      .orderBy(asc(appleTokensToRevoke.revokeAfter), asc(appleTokensToRevoke.id))
      .limit(appleRevocationRules.batchSize)
      // A row another run holds is still due next time.
      .for("update", { skipLocked: true });
    if (due.length > 0) {
      await tx
        .update(appleTokensToRevoke)
        .set({ revokeAfter: new Date(now.getTime() + appleRevocationRules.leaseMs) })
        .where(
          inArray(
            appleTokensToRevoke.id,
            due.map((row) => row.id),
          ),
        );
    }
    return due;
  });

  const revoked: string[] = [];
  const refused: string[] = [];
  for (const row of taken) {
    let done = false;
    try {
      done = await revoke(row.token);
    } catch {
      // Tried again later; the error is not logged, in case it carries the token.
    }
    (done ? revoked : refused).push(row.id);
  }
  if (revoked.length > 0) {
    await db.delete(appleTokensToRevoke).where(inArray(appleTokensToRevoke.id, revoked));
  }
  if (refused.length > 0) {
    await db
      .update(appleTokensToRevoke)
      .set({ revokeAfter: new Date(now.getTime() + appleRevocationRules.retryAfterMs) })
      .where(inArray(appleTokensToRevoke.id, refused));
    logger.warn({ refused: refused.length }, "Apple refused token revocations; tried again later");
  }
  return { revoked: revoked.length, refused: refused.length };
}
