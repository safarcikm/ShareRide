import { schema, type Database } from "@shareride/db";
import { retentionCutoffs } from "@shareride/domain";
import { and, eq, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import { notHeld } from "../privacy/holds.ts";

const {
  appleTokensToRevoke,
  emailSignIns,
  emailVerifications,
  memberPasskeyChallenges,
  providerSignIns,
  pushTokens,
  rateLimitEvents,
  sessionTokens,
  sessions,
  verificationCodes,
} = schema;

export interface CleanUpCounts {
  readonly codes: number;
  readonly rateLimitEvents: number;
  readonly tokens: number;
  readonly sessionsEnded: number;
  readonly sessionsDeleted: number;
  /** Links to verify an email, a day after they were sent. */
  readonly emailLinks: number;
  /** Google and Apple sign-ins, an hour after they expired. */
  readonly providerSignIns: number;
  /** Email sign-ins waiting for the phone step, an hour after they expired (spec 26). */
  readonly emailSignIns: number;
  /** Members' passkey challenges, an hour after they expired (spec 27). */
  readonly passkeyChallenges: number;
  /** Apple tokens of ended links Apple did not take, 7 days after they were queued (spec 37). */
  readonly appleTokens: number;
}

/**
 * Deletes sign-in records past their retention (privacy inventory) and ends
 * sessions nobody has used for 60 days. An ended session of a held person
 * stays (spec 11, 3.7.3); codes, tokens and links are keys, not records, and
 * go on time. Safe to run at any time and more than once; the scheduled
 * clean-up runs it every hour.
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
    // An idle device gets no more news either.
    if (endedIds.length > 0) {
      await tx.delete(pushTokens).where(inArray(pushTokens.sessionId, endedIds));
    }

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
      .where(
        and(
          lt(sessions.endedAt, cutoff.sessionsEndedBefore),
          notHeld(tx, now, [["user", sessions.userId]]),
        ),
      )
      .returning({ id: sessions.id });

    const links = await tx
      .delete(emailVerifications)
      .where(lte(emailVerifications.sentAt, cutoff.emailLinksSentBefore))
      .returning({ id: emailVerifications.id });

    const providerRows = await tx
      .delete(providerSignIns)
      .where(lt(providerSignIns.expiresAt, cutoff.providerSignInsExpiredBefore))
      .returning({ id: providerSignIns.id });

    const emailRows = await tx
      .delete(emailSignIns)
      .where(lt(emailSignIns.expiresAt, cutoff.emailSignInsExpiredBefore))
      .returning({ id: emailSignIns.id });

    const challengeRows = await tx
      .delete(memberPasskeyChallenges)
      .where(lt(memberPasskeyChallenges.expiresAt, cutoff.passkeyChallengesExpiredBefore))
      .returning({ id: memberPasskeyChallenges.id });

    const appleRows = await tx
      .delete(appleTokensToRevoke)
      .where(lte(appleTokensToRevoke.queuedAt, cutoff.appleTokensQueuedBefore))
      .returning({ id: appleTokensToRevoke.id });

    return {
      appleTokens: appleRows.length,
      emailLinks: links.length,
      providerSignIns: providerRows.length,
      emailSignIns: emailRows.length,
      passkeyChallenges: challengeRows.length,
      codes: codes.length,
      rateLimitEvents: events.length,
      tokens: tokens.length,
      sessionsEnded: ended.length,
      sessionsDeleted: deleted.length,
    };
  });
}
