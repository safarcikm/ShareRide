import { schema, type Database } from "@shareride/db";
import {
  checkCodeAttempt,
  checkRateLimits,
  codeRules,
  codeSendLimits,
  decideRefresh,
  err,
  generateCode,
  normalisePhoneNumber,
  ok,
  sessionRules,
  type PhoneNumberError,
  type RateLimited,
  type RateLimitRule,
  type Result,
} from "@shareride/domain";
import { createTranslator, type Locale } from "@shareride/i18n";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { hashToken, newToken, sameHash, type KeyedHasher } from "../../platform/crypto.ts";
import type { SmsSender } from "../../platform/sms.ts";
import type { Logger } from "../../logger.ts";

const { rateLimitEvents, sessions, sessionTokens, users, verificationCodes } = schema;

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

export type Platform = "ios" | "android" | "web";

export interface Device {
  readonly platform: Platform;
  readonly name?: string | undefined;
  readonly appVersion?: string | undefined;
}

export interface IssuedTokens {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: Date;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: Date;
}

export interface SignedIn {
  readonly userId: string;
  readonly sessionId: string;
  readonly platform: Platform;
  readonly isNewUser: boolean;
  readonly tokens: IssuedTokens;
}

export interface Refreshed {
  readonly platform: Platform;
  readonly tokens: IssuedTokens;
}

export type StartError = PhoneNumberError | RateLimited | { readonly code: "sms_failed" };

export type VerifyError =
  | PhoneNumberError
  | { readonly code: "code_invalid"; readonly attemptsLeft: number }
  | { readonly code: "code_expired" }
  | { readonly code: "code_attempts_exceeded"; readonly retryAfterSeconds: number }
  | { readonly code: "account_unavailable" };

export type RefreshError =
  { readonly code: "refresh_invalid" } | { readonly code: "session_ended" };

export interface SessionSummary {
  readonly id: string;
  readonly deviceName: string | null;
  readonly platform: Platform;
  readonly appVersion: string | null;
  readonly createdAt: Date;
  readonly lastActiveAt: Date;
}

export interface AuthService {
  /** Sends a sign-in code (spec 1, 3.2). Never reveals whether an account exists. */
  start(input: {
    readonly phoneNumber: string;
    readonly locale: Locale;
    readonly ipAddress: string;
  }): Promise<Result<{ readonly resendAfterSeconds: number }, StartError>>;
  /** Checks a code, then signs in or creates the account and starts a session. */
  verify(input: {
    readonly phoneNumber: string;
    readonly code: string;
    readonly locale: Locale;
    readonly device: Device;
  }): Promise<Result<SignedIn, VerifyError>>;
  /** Rotates the refresh token (ADR 0016). */
  refresh(refreshToken: string): Promise<Result<Refreshed, RefreshError>>;
  /** The session an access token belongs to, or null. */
  authenticate(accessToken: string): Promise<{ userId: string; sessionId: string } | null>;
  signOut(input: {
    readonly userId: string;
    readonly sessionId: string;
    readonly all: boolean;
  }): Promise<void>;
  listSessions(userId: string): Promise<SessionSummary[]>;
  /** Ends one of the user's own sessions; false if there is no such active session. */
  endSession(userId: string, sessionId: string): Promise<boolean>;
}

export interface AuthServiceDependencies {
  readonly db: Database;
  readonly sms: SmsSender;
  readonly hasher: KeyedHasher;
  readonly clock: () => Date;
  readonly logger: Logger;
  /** A cryptographically secure random integer in [0, max). */
  readonly randomInt: (max: number) => number;
}

const addSeconds = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000);

/** How often `last_active_at` is written, so not every request writes. */
const lastActiveWriteSeconds = 5 * 60;

const longestWindowSeconds = (rules: readonly RateLimitRule[]) =>
  Math.max(...rules.map((rule) => rule.windowSeconds));

export function createAuthService(dependencies: AuthServiceDependencies): AuthService {
  const { db, sms, hasher, clock, logger, randomInt } = dependencies;
  const translators = { is: createTranslator("is"), en: createTranslator("en") };

  async function sendTimes(
    executor: Executor,
    scope: string,
    keyHash: string,
    rules: readonly RateLimitRule[],
    now: Date,
  ): Promise<Date[]> {
    const rows = await executor
      .select({ createdAt: rateLimitEvents.createdAt })
      .from(rateLimitEvents)
      .where(
        and(
          eq(rateLimitEvents.scope, scope),
          eq(rateLimitEvents.keyHash, keyHash),
          gt(rateLimitEvents.createdAt, addSeconds(now, -longestWindowSeconds(rules))),
        ),
      );
    return rows.map((row) => row.createdAt);
  }

  /** Seconds until a new code can be sent to this number. */
  async function resendWait(executor: Executor, phoneHash: string, now: Date): Promise<number> {
    const rules = codeSendLimits.perNumber;
    const check = checkRateLimits(
      await sendTimes(executor, "phone", phoneHash, rules, now),
      rules,
      now,
    );
    return check.ok ? 0 : check.error.retryAfterSeconds;
  }

  async function issueTokens(executor: Executor, sessionId: string, now: Date) {
    const accessToken = newToken("access");
    const refreshToken = newToken("refresh");
    const accessTokenExpiresAt = addSeconds(now, sessionRules.accessTokenSeconds);
    const refreshTokenExpiresAt = addSeconds(now, sessionRules.refreshTokenIdleSeconds);
    const rows = await executor
      .insert(sessionTokens)
      .values([
        {
          sessionId,
          kind: "access",
          tokenHash: hashToken(accessToken),
          expiresAt: accessTokenExpiresAt,
          createdAt: now,
          updatedAt: now,
        },
        {
          sessionId,
          kind: "refresh",
          tokenHash: hashToken(refreshToken),
          expiresAt: refreshTokenExpiresAt,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .returning({ id: sessionTokens.id, kind: sessionTokens.kind });
    const refreshRow = rows.find((row) => row.kind === "refresh");
    if (refreshRow === undefined) throw new Error("The refresh token was not stored.");
    return {
      refreshTokenId: refreshRow.id,
      tokens: { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt },
    };
  }

  /** Ends sessions and deletes their tokens, so none of them works again. */
  async function endSessions(
    executor: Executor,
    sessionIds: readonly string[],
    reason: string,
    now: Date,
  ): Promise<void> {
    if (sessionIds.length === 0) return;
    await executor
      .update(sessions)
      .set({ endedAt: now, endReason: reason, updatedAt: now })
      .where(and(inArray(sessions.id, [...sessionIds]), isNull(sessions.endedAt)));
    await executor.delete(sessionTokens).where(inArray(sessionTokens.sessionId, [...sessionIds]));
  }

  return {
    async start(input) {
      const phone = normalisePhoneNumber(input.phoneNumber);
      if (!phone.ok) return err(phone.error);
      const { e164, callingCode } = phone.value;
      const now = clock();
      const phoneHash = hasher("phone", e164);
      const limits = [
        { scope: "phone", keyHash: phoneHash, rules: codeSendLimits.perNumber },
        { scope: "ip", keyHash: hasher("ip", input.ipAddress), rules: codeSendLimits.perIpAddress },
        {
          scope: "calling_code",
          keyHash: hasher("calling-code", callingCode),
          rules: codeSendLimits.perCallingCode(callingCode),
        },
      ];
      const code = generateCode(randomInt);

      const refused = await db.transaction(async (tx) => {
        // One request per number at a time, so two cannot both pass the limits.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${phoneHash}, 0))`);
        for (const limit of limits) {
          const earlier = await sendTimes(tx, limit.scope, limit.keyHash, limit.rules, now);
          const check = checkRateLimits(earlier, limit.rules, now);
          if (!check.ok) return { scope: limit.scope, error: check.error };
        }
        // Only the newest code works: a new one replaces any earlier one.
        await tx.delete(verificationCodes).where(eq(verificationCodes.phoneHash, phoneHash));
        await tx.insert(verificationCodes).values({
          phoneHash,
          codeHash: hasher("code", `${phoneHash}:${code}`),
          expiresAt: addSeconds(now, codeRules.validForSeconds),
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(rateLimitEvents).values(
          limits.map((limit) => ({
            scope: limit.scope,
            keyHash: limit.keyHash,
            createdAt: now,
            updatedAt: now,
          })),
        );
        return undefined;
      });

      if (refused !== undefined) {
        if (refused.scope === "calling_code") {
          // An unusual number of codes to one country can be SMS fraud (R1.3).
          logger.warn({ callingCode }, "sign-in codes per calling code limit reached");
        }
        return err(refused.error);
      }

      try {
        await sms.send({ to: e164, text: translators[input.locale]("sms.signInCode", { code }) });
      } catch (error) {
        logger.error({ err: error, callingCode }, "sign-in code SMS not sent");
        return err({ code: "sms_failed" });
      }
      logger.info({ callingCode }, "sign-in code sent");
      return ok({ resendAfterSeconds: codeSendLimits.perNumber[0].windowSeconds });
    },

    async verify(input) {
      const phone = normalisePhoneNumber(input.phoneNumber);
      if (!phone.ok) return err(phone.error);
      const { e164 } = phone.value;
      const now = clock();
      const phoneHash = hasher("phone", e164);

      return db.transaction(async (tx): Promise<Result<SignedIn, VerifyError>> => {
        const [stored] = await tx
          .select()
          .from(verificationCodes)
          .where(eq(verificationCodes.phoneHash, phoneHash))
          .orderBy(desc(verificationCodes.createdAt))
          .limit(1)
          .for("update");
        if (stored === undefined) return err({ code: "code_expired" });

        const attempt = checkCodeAttempt(stored, now);
        if (!attempt.ok) {
          return attempt.error.code === "code_attempts_exceeded"
            ? err({ ...attempt.error, retryAfterSeconds: await resendWait(tx, phoneHash, now) })
            : err(attempt.error);
        }

        if (!sameHash(hasher("code", `${phoneHash}:${input.code}`), stored.codeHash)) {
          await tx
            .update(verificationCodes)
            .set({ attempts: stored.attempts + 1, updatedAt: now })
            .where(eq(verificationCodes.id, stored.id));
          const { attemptsLeft } = attempt.value;
          return attemptsLeft === 0
            ? err({
                code: "code_attempts_exceeded",
                retryAfterSeconds: await resendWait(tx, phoneHash, now),
              })
            : err({ code: "code_invalid", attemptsLeft });
        }

        // Single use: the code is deleted (spec 1, section 7).
        await tx.delete(verificationCodes).where(eq(verificationCodes.id, stored.id));

        let [user] = await tx
          .select({ id: users.id, status: users.status })
          .from(users)
          .where(eq(users.phoneE164, e164))
          .for("update");
        const isNewUser = user === undefined;
        if (user === undefined) {
          [user] = await tx
            .insert(users)
            .values({
              phoneE164: e164,
              phoneVerifiedAt: now,
              locale: input.locale,
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: users.id, status: users.status });
          if (user === undefined) throw new Error("The new user was not stored.");
        }
        if (user.status !== "active") return err({ code: "account_unavailable" });

        const [session] = await tx
          .insert(sessions)
          .values({
            userId: user.id,
            platform: input.device.platform,
            deviceName: input.device.name ?? null,
            appVersion: input.device.appVersion ?? null,
            lastActiveAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: sessions.id });
        if (session === undefined) throw new Error("The session was not stored.");
        const { tokens } = await issueTokens(tx, session.id, now);

        logger.info({ userId: user.id, sessionId: session.id, isNewUser }, "signed in");
        return ok({
          userId: user.id,
          sessionId: session.id,
          platform: input.device.platform,
          isNewUser,
          tokens,
        });
      });
    },

    async refresh(refreshToken) {
      const now = clock();
      return db.transaction(async (tx): Promise<Result<Refreshed, RefreshError>> => {
        // Locks the token and its session, so two refreshes of one session run in turn.
        const [row] = await tx
          .select({ token: sessionTokens, session: sessions, userStatus: users.status })
          .from(sessionTokens)
          .innerJoin(sessions, eq(sessions.id, sessionTokens.sessionId))
          .innerJoin(users, eq(users.id, sessions.userId))
          .where(
            and(
              eq(sessionTokens.tokenHash, hashToken(refreshToken)),
              eq(sessionTokens.kind, "refresh"),
            ),
          )
          .for("update");
        if (row === undefined) return err({ code: "refresh_invalid" });
        const { token, session } = row;
        if (row.userStatus !== "active") {
          await endSessions(tx, [session.id], "account_unavailable", now);
          return err({ code: "session_ended" });
        }

        let replacementIsCurrent = false;
        if (token.replacedBy !== null) {
          const [replacement] = await tx
            .select({ rotatedAt: sessionTokens.rotatedAt })
            .from(sessionTokens)
            .where(eq(sessionTokens.id, token.replacedBy));
          replacementIsCurrent = replacement !== undefined && replacement.rotatedAt === null;
        }

        const decision = decideRefresh(
          {
            expiresAt: token.expiresAt,
            rotatedAt: token.rotatedAt,
            replacementIsCurrent,
            sessionEnded: session.endedAt !== null,
          },
          now,
        );

        if (decision === "rotate" || decision === "retry") {
          await tx
            .delete(sessionTokens)
            .where(and(eq(sessionTokens.sessionId, session.id), eq(sessionTokens.kind, "access")));
          const issued = await issueTokens(tx, session.id, now);
          if (decision === "retry" && token.replacedBy !== null) {
            // The reply with the replacement was lost: retire it as well.
            await tx
              .update(sessionTokens)
              .set({ rotatedAt: now, replacedBy: issued.refreshTokenId, updatedAt: now })
              .where(eq(sessionTokens.id, token.replacedBy));
          }
          await tx
            .update(sessionTokens)
            .set({
              rotatedAt: token.rotatedAt ?? now,
              replacedBy: issued.refreshTokenId,
              updatedAt: now,
            })
            .where(eq(sessionTokens.id, token.id));
          await tx
            .update(sessions)
            .set({ lastActiveAt: now, updatedAt: now })
            .where(eq(sessions.id, session.id));
          return ok({ platform: session.platform as Platform, tokens: issued.tokens });
        }

        if (decision === "reuse_detected" || decision === "expired") {
          await endSessions(
            tx,
            [session.id],
            decision === "expired" ? "expired" : "refresh_reused",
            now,
          );
          if (decision === "reuse_detected") {
            logger.warn(
              { userId: session.userId, sessionId: session.id },
              "rotated refresh token reused; session ended",
            );
          }
        }
        return err({ code: "session_ended" });
      });
    },

    async authenticate(accessToken) {
      const now = clock();
      const [row] = await db
        .select({
          userId: sessions.userId,
          sessionId: sessions.id,
          lastActiveAt: sessions.lastActiveAt,
        })
        .from(sessionTokens)
        .innerJoin(sessions, eq(sessions.id, sessionTokens.sessionId))
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
          and(
            eq(sessionTokens.tokenHash, hashToken(accessToken)),
            eq(sessionTokens.kind, "access"),
            gt(sessionTokens.expiresAt, now),
            isNull(sessions.endedAt),
            eq(users.status, "active"),
          ),
        )
        .limit(1);
      if (row === undefined) return null;
      if (now.getTime() - row.lastActiveAt.getTime() > lastActiveWriteSeconds * 1000) {
        await db
          .update(sessions)
          .set({ lastActiveAt: now, updatedAt: now })
          .where(eq(sessions.id, row.sessionId));
      }
      return { userId: row.userId, sessionId: row.sessionId };
    },

    async signOut({ userId, sessionId, all }) {
      const now = clock();
      await db.transaction(async (tx) => {
        const ids = all
          ? (
              await tx
                .select({ id: sessions.id })
                .from(sessions)
                .where(and(eq(sessions.userId, userId), isNull(sessions.endedAt)))
            ).map((row) => row.id)
          : [sessionId];
        await endSessions(tx, ids, all ? "sign_out_all" : "sign_out", now);
      });
      logger.info({ userId, sessionId, all }, "signed out");
    },

    async listSessions(userId) {
      const rows = await db
        .select({
          id: sessions.id,
          deviceName: sessions.deviceName,
          platform: sessions.platform,
          appVersion: sessions.appVersion,
          createdAt: sessions.createdAt,
          lastActiveAt: sessions.lastActiveAt,
        })
        .from(sessions)
        .where(and(eq(sessions.userId, userId), isNull(sessions.endedAt)))
        .orderBy(desc(sessions.lastActiveAt));
      return rows.map((row) => ({ ...row, platform: row.platform as Platform }));
    },

    async endSession(userId, sessionId) {
      const now = clock();
      return db.transaction(async (tx) => {
        const [session] = await tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(
            and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.endedAt)),
          );
        if (session === undefined) return false;
        await endSessions(tx, [session.id], "signed_out_from_other_device", now);
        return true;
      });
    },
  };
}
