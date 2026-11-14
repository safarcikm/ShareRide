import { schema, type Database } from "@shareride/db";
import { retentionCutoffs } from "@shareride/domain";
import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";

const { rateLimitEvents, sessionTokens, sessions, verificationCodes } = schema;

export interface CleanUpCounts {
  readonly codes: number;
  readonly rateLimitEvents: number;
  readonly tokens: number;
  readonly sessionsEnded: number;
  readonly sessionsDeleted: number;
}

/**
 * Deletes sign-in records past their retention (privacy inventory) and ends
 * sessions nobody has used for 60 days. Safe to run at any time and more
 * than once; the scheduled clean-up runs it every hour.
 */
export async function cleanUpSignInRecords(db: Database, now: Date): Promise<CleanUpCounts> {
  const cutoff = retentionCutoffs(now);
  return db.transaction(async (tx) => {
    const codes = await tx
      .delete(verificationCodes)
      .where(
        or(
          lt(verificationCodes.expiresAt, cutoff.codesExpiredBefore),
          isNotNull(verificationCodes.usedAt),
        ),
      )
      .returning({ id: verificationCodes.id });

    const events = await tx
      .delete(rateLimitEvents)
      .where(lt(rateLimitEvents.createdAt, cutoff.rateLimitEventsBefore))
      .returning({ id: rateLimitEvents.id });

    const ended = await tx
      .update(sessions)
      .set({ endedAt: now, endReason: "idle", updatedAt: now })
      .where(and(isNull(sessions.endedAt), lt(sessions.lastActiveAt, cutoff.sessionsIdleSince)))
      .returning({ id: sessions.id });
    const endedIds = ended.map((row) => row.id);

    // A rotated refresh token stays until its session ends, however old: if
    // it is ever presented again, that is reuse and ends the session (ADR 0016).
    const expired = and(
      lt(sessionTokens.expiresAt, cutoff.tokensExpiredBefore),
      or(eq(sessionTokens.kind, "access"), isNull(sessionTokens.rotatedAt)),
    );
    const tokens = await tx
      .delete(sessionTokens)
      .where(
        endedIds.length === 0 ? expired : or(expired, inArray(sessionTokens.sessionId, endedIds)),
      )
      .returning({ id: sessionTokens.id });

    const deleted = await tx
      .delete(sessions)
      .where(lt(sessions.endedAt, cutoff.sessionsEndedBefore))
      .returning({ id: sessions.id });

    return {
      codes: codes.length,
      rateLimitEvents: events.length,
      tokens: tokens.length,
      sessionsEnded: ended.length,
      sessionsDeleted: deleted.length,
    };
  });
}
