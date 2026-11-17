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
  type CodePurpose,
  type PhoneNumberError,
  type RateLimited,
  type RateLimitRule,
  type Result,
} from "@shareride/domain";
import { createTranslator, type Locale } from "@shareride/i18n";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { addressBlock } from "../../platform/client-address.ts";
import { hashToken, newToken, sameHash, type KeyedHasher } from "../../platform/crypto.ts";
import type { SmsSender } from "../../platform/sms.ts";
import type { Logger } from "../../logger.ts";

const { pushTokens, rateLimitEvents, sessions, sessionTokens, users, verificationCodes } = schema;

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
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

export type ConfirmError =
  | { readonly code: "code_invalid"; readonly attemptsLeft: number }
  | { readonly code: "code_expired" }
  | { readonly code: "code_attempts_exceeded"; readonly retryAfterSeconds: number };

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
  /**
   * Sends a code to the person's own number to confirm a sensitive action
   * (spec 11, R11.1), under the sign-in limits.
   */
  sendConfirmCode(input: {
    readonly userId: string;
    readonly ipAddress: string;
  }): Promise<Result<{ readonly resendAfterSeconds: number }, StartError>>;
  /**
   * Checks a confirm code, then runs the action in the same transaction. A
   * wrong code is counted and the action does not run. The code is used up
   * only when the action succeeds: when it returns an error or throws, its
   * changes are rolled back and the code still works. So check whatever
   * else can refuse the action before asking for the code.
   */
  withConfirmCode<T, E>(
    userId: string,
    code: string,
    action: (tx: Transaction) => Promise<Result<T, E>>,
  ): Promise<Result<T, ConfirmError | E>>;
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

/**
 * Ends sessions and deletes their tokens, so none of them works again, and
 * their push tokens, so the devices get no more news.
 */
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
  await executor.delete(pushTokens).where(inArray(pushTokens.sessionId, [...sessionIds]));
}

/** Signs the person out of every device, as part of a larger change such as deleting the account. */
export async function endAllSessions(
  executor: Executor,
  userId: string,
  reason: string,
  now: Date,
): Promise<void> {
  const open = await executor
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.endedAt)));
  await endSessions(
    executor,
    open.map((row) => row.id),
    reason,
    now,
  );
}

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

  /**
   * Sends a new code for its purpose under the limits of rule R1.3, which
   * sign-in and confirming share. It replaces the number's earlier code for
   * the same purpose only.
   */
  async function sendCode(input: {
    readonly e164: string;
    readonly callingCode: string;
    readonly purpose: CodePurpose;
    readonly locale: Locale;
    readonly ipAddress: string;
  }): Promise<Result<{ readonly resendAfterSeconds: number }, StartError>> {
    const { e164, callingCode, purpose } = input;
    const now = clock();
    const phoneHash = hasher("phone", e164);
    const limits = [
      { scope: "phone", keyHash: phoneHash, rules: codeSendLimits.perNumber },
      {
        // An IPv6 address counts by its /64 network, as search does.
        scope: "ip",
        keyHash: hasher("ip", addressBlock(input.ipAddress)),
        rules: codeSendLimits.perIpAddress,
      },
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
      await tx
        .delete(verificationCodes)
        .where(
          and(eq(verificationCodes.phoneHash, phoneHash), eq(verificationCodes.purpose, purpose)),
        );
      await tx.insert(verificationCodes).values({
        phoneHash,
        purpose,
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

    const text =
      purpose === "sign_in"
        ? translators[input.locale]("sms.signInCode", { code })
        : translators[input.locale]("sms.confirmCode", { code });
    try {
      await sms.send({ to: e164, text });
    } catch (error) {
      logger.error({ err: error, callingCode, purpose }, "sign-in code SMS not sent");
      return err({ code: "sms_failed" });
    }
    logger.info({ callingCode, purpose }, "sign-in code sent");
    return ok({ resendAfterSeconds: codeSendLimits.perNumber[0].windowSeconds });
  }

  /**
   * Checks the newest code of a number for its purpose. A right code is
   * deleted (single use, spec 1, section 7); a wrong one is counted.
   */
  async function checkCode(
    tx: Transaction,
    phoneHash: string,
    purpose: CodePurpose,
    code: string,
    now: Date,
  ): Promise<Result<void, ConfirmError>> {
    const [stored] = await tx
      .select()
      .from(verificationCodes)
      .where(
        and(eq(verificationCodes.phoneHash, phoneHash), eq(verificationCodes.purpose, purpose)),
      )
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

    if (!sameHash(hasher("code", `${phoneHash}:${code}`), stored.codeHash)) {
      await tx
        .update(verificationCodes)
        .set({ attempts: sql`${verificationCodes.attempts} + 1`, updatedAt: now })
        .where(eq(verificationCodes.id, stored.id));
      const { attemptsLeft } = attempt.value;
      return attemptsLeft === 0
        ? err({
            code: "code_attempts_exceeded",
            retryAfterSeconds: await resendWait(tx, phoneHash, now),
          })
        : err({ code: "code_invalid", attemptsLeft });
    }

    await tx.delete(verificationCodes).where(eq(verificationCodes.id, stored.id));
    return ok(undefined);
  }

  return {
    async start(input) {
      const phone = normalisePhoneNumber(input.phoneNumber);
      if (!phone.ok) return err(phone.error);
      return sendCode({
        ...phone.value,
        purpose: "sign_in",
        locale: input.locale,
        ipAddress: input.ipAddress,
      });
    },

    async verify(input) {
      const phone = normalisePhoneNumber(input.phoneNumber);
      if (!phone.ok) return err(phone.error);
      const { e164 } = phone.value;
      const now = clock();
      const phoneHash = hasher("phone", e164);

      return db.transaction(async (tx): Promise<Result<SignedIn, VerifyError>> => {
        const checked = await checkCode(tx, phoneHash, "sign_in", input.code, now);
        if (!checked.ok) return checked;

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
        if (all) await endAllSessions(tx, userId, "sign_out_all", now);
        else await endSessions(tx, [sessionId], "sign_out", now);
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

    async sendConfirmCode(input) {
      const [user] = await db
        .select({ phoneE164: users.phoneE164, locale: users.locale })
        .from(users)
        .where(eq(users.id, input.userId));
      if (user === undefined || user.phoneE164 === null) {
        throw new Error("The signed-in user has no phone number.");
      }
      // The stored number as it is, so the code is kept under the same hash
      // that withConfirmCode looks for, even if the number would no longer
      // pass today's checks; its calling code only sets the limits and logs.
      const phone = normalisePhoneNumber(user.phoneE164);
      return sendCode({
        e164: user.phoneE164,
        callingCode: phone.ok ? phone.value.callingCode : "unknown",
        purpose: "confirm",
        locale: user.locale === "is" ? "is" : "en",
        ipAddress: input.ipAddress,
      });
    },

    async withConfirmCode<T, E>(
      userId: string,
      code: string,
      action: (tx: Transaction) => Promise<Result<T, E>>,
    ): Promise<Result<T, ConfirmError | E>> {
      const now = clock();
      let refused: { readonly error: E } | undefined;
      try {
        return await db.transaction(async (tx): Promise<Result<T, ConfirmError | E>> => {
          const [user] = await tx
            .select({ phoneE164: users.phoneE164 })
            .from(users)
            .where(eq(users.id, userId));
          if (user === undefined || user.phoneE164 === null) return err({ code: "code_expired" });
          // A wrong code returns, so the transaction commits its count.
          const checked = await checkCode(
            tx,
            hasher("phone", user.phoneE164),
            "confirm",
            code,
            now,
          );
          if (!checked.ok) return checked;
          const done = await action(tx);
          if (!done.ok) {
            // Undo the action and keep the code for another try.
            refused = { error: done.error };
            tx.rollback();
          }
          return done;
        });
      } catch (error) {
        if (refused !== undefined) return err(refused.error);
        throw error;
      }
    },
  };
}
