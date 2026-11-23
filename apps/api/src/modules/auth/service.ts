import { randomUUID } from "node:crypto";
import { schema, type Database } from "@shareride/db";
import {
  checkCodeAttempt,
  checkRateLimits,
  codeRules,
  codeSendLimits,
  confirmChannel,
  decideLink,
  decideRefresh,
  emailAtPhoneStep,
  emailCodeSendLimits,
  emailSignInRules,
  err,
  generateCode,
  hideEmail,
  normaliseEmail,
  normalisePhoneNumber,
  ok,
  recoveryCodeSendLimits,
  textSendLimits,
  type CodePurpose,
  type EmailAtPhoneStep,
  type PhoneNumberError,
  type RateLimited,
  type RateLimitRule,
  type Result,
} from "@shareride/domain";
import { createTranslator, type Locale } from "@shareride/i18n";
import { and, desc, eq, gt, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { addressBlock } from "../../platform/client-address.ts";
import { hashToken, newToken, sameHash, type KeyedHasher } from "../../platform/crypto.ts";
import type { EmailChannel } from "../../platform/email.ts";
import { captureError } from "../../platform/error-reporting.ts";
import { MaybeSent } from "../../platform/maybe-sent.ts";
import type { SmsSender } from "../../platform/sms.ts";
import type { Logger } from "../../logger.ts";
import type { SignUpGate, SignUpRefusal } from "../beta/invites.ts";
import {
  applyLink,
  linkStateOf,
  lockPendingSignIn,
  subjectTakenConstraint,
  type LinkOutcome,
  type PendingSignIn,
} from "./identities.ts";
import { codeEmailContent, sendEmailChangedNotice } from "./emails.ts";
import { issueTokens, openSession } from "./sessions.ts";
import { uniqueViolation } from "../../platform/database-errors.ts";

/** An email proven by its code, waiting for the phone step (spec 26, 3.3). */
interface PendingEmailSignIn {
  readonly id: string;
  readonly email: string;
}

const {
  blockedNumbers,
  emailSignIns,
  emailVerifications,
  providerSignIns,
  pushTokens,
  rateLimitEvents,
  sessions,
  sessionTokens,
  users,
  verificationCodes,
} = schema;

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
  /** With a waiting Google or Apple sign-in: what became of it. */
  readonly providerLink?: LinkOutcome;
  /** A new account's first name from Google or Apple, for step 3 only (R19.5). */
  readonly suggestedFirstName?: string;
  /** With a waiting email sign-in: what became of its email (spec 26, 3.3). */
  readonly emailLink?: EmailLink;
  /** An email the phone step replaced, whose old address is told after the sign-in (R26.6). */
  readonly emailChanged?: {
    readonly oldEmail: string;
    readonly newEmail: string;
    readonly locale: Locale;
  };
}

/** What the phone step did with a waiting email sign-in's address (spec 26, 3.3, item 3). */
export interface EmailLink {
  readonly outcome: EmailAtPhoneStep;
  readonly email: string;
}

/** An email code's outcome: signed in to the email's account, or on to the phone step. */
export type EmailVerified = ({ readonly status: "signedIn" } & SignedIn) | EmailPhoneNeeded;

/** A proven email with no account, waiting for the phone step (spec 26, 3.2). */
export interface EmailPhoneNeeded {
  readonly status: "phoneNeeded";
  readonly pendingSignIn: string;
  readonly provider: "email";
  readonly email: string;
  readonly firstName: null;
  readonly expiresAt: Date;
}

export type EmailStartError =
  | { readonly code: "email_invalid" }
  | { readonly code: "email_failed" }
  /** The server sends no email (`EMAIL_PROVIDER=none`, spec 26, 3.1). */
  | { readonly code: "email_unavailable" }
  | RateLimited;

export type EmailVerifyError =
  { readonly code: "email_invalid" } | ConfirmError | { readonly code: "account_unavailable" };

/** Where a confirm code went (spec 26, 3.6). */
export interface ConfirmCodeSent {
  readonly resendAfterSeconds: number;
  readonly channel: "email" | "sms";
  /** The email partly hidden, or the number's last two digits. */
  readonly sentTo: string;
}

export interface Refreshed {
  readonly platform: Platform;
  readonly tokens: IssuedTokens;
}

export type StartError =
  | PhoneNumberError
  | RateLimited
  | { readonly code: "sms_failed" }
  /** The operator paused text messages (spec 10, 3.3): no code can be sent. */
  | { readonly code: "sms_paused" }
  /** The waiting email, Google or Apple sign-in is gone (spec 26, R26.2): no text is sent. */
  | { readonly code: "provider_expired" };

export type VerifyError =
  | PhoneNumberError
  | { readonly code: "code_invalid"; readonly attemptsLeft: number }
  | { readonly code: "code_expired" }
  | { readonly code: "code_attempts_exceeded"; readonly retryAfterSeconds: number }
  | { readonly code: "account_unavailable" }
  /** The waiting Google or Apple sign-in is gone: older than 30 minutes, or used. */
  | { readonly code: "provider_expired" }
  /** Another account has the Google or Apple account, and the number has none (R19.1). */
  | { readonly code: "provider_in_use" }
  | SignUpRefusal;

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
  /**
   * Texts the phone step's code (spec 1, 3.2; spec 26, 3.3), only for a
   * waiting email, Google or Apple sign-in (R26.2). Never reveals whether
   * an account exists.
   */
  start(input: {
    readonly phoneNumber: string;
    readonly locale: Locale;
    readonly ipAddress: string;
    readonly pendingSignIn: string;
  }): Promise<Result<{ readonly resendAfterSeconds: number }, StartError>>;
  /** Emails a sign-in code (spec 26, 3.2): the same answer whether or not an account has it. */
  startEmail(input: {
    readonly email: string;
    readonly locale: Locale;
    readonly ipAddress: string;
  }): Promise<Result<{ readonly resendAfterSeconds: number }, EmailStartError>>;
  /** Checks an email code: signs in to the email's account, or waits for the phone step. */
  verifyEmail(input: {
    readonly email: string;
    readonly code: string;
    readonly device: Device;
  }): Promise<Result<EmailVerified, EmailVerifyError>>;
  /** Checks a code, then signs in or creates the account and starts a session. */
  verify(input: {
    readonly phoneNumber: string;
    readonly code: string;
    readonly locale: Locale;
    readonly device: Device;
    /** For a number with no account, while the beta is closed (spec 12, R12.1). */
    readonly inviteCode?: string | undefined;
    /**
     * The email, Google or Apple sign-in waiting for this phone step (spec
     * 19, 3.3; spec 26, 3.3): a number alone never signs in (R26.1).
     */
    readonly pendingSignIn: string;
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
   * Sends a code to confirm a sensitive action (spec 11, R11.1): by email
   * to the account's verified email, by text to its number without one
   * (spec 26, R26.7), under the sign-in limits. Either way it is the
   * number's confirm code.
   */
  sendConfirmCode(input: {
    readonly userId: string;
    readonly ipAddress: string;
  }): Promise<Result<ConfirmCodeSent, StartError | EmailStartError>>;
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
  /**
   * Sends a console recovery code to this number (spec 22): the caller has
   * checked that it is an operator's. Counted apart from the number's
   * sign-in codes (R22.6), and sent while the console pauses texts (R22.5).
   */
  sendRecoveryCode(input: {
    readonly e164: string;
    readonly locale: Locale;
  }): Promise<Result<{ readonly resendAfterSeconds: number }, StartError>>;
  /** As `withConfirmCode`, for the number's console recovery code. */
  withRecoveryCode<T, E>(
    e164: string,
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
  /** Whether a new account can be made (the closed beta's invite codes); open when left out. */
  readonly signUpGate?: SignUpGate;
  /** Whether the operator paused text messages (spec 10, 3.3); never when left out. */
  readonly smsPaused?: () => Promise<boolean>;
  /** Who sends email: sign-in and confirm codes (spec 26); none when left out. */
  readonly email?: EmailChannel;
}

const addSeconds = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000);

/**
 * The accounts that can sign in and stay signed in. A suspended person
 * keeps reading, downloading and deleting their data (spec 9, 3.6.2); the
 * API refuses them what a suspension takes away.
 */
export const signInStatuses = ["active", "suspended"];
export const canSignIn = (status: string) => signInStatuses.includes(status);

/** How often `last_active_at` is written, so not every request writes. */
/** The outcomes of the phone step that add a way into an account. */
const linkingOutcomes: readonly LinkOutcome["outcome"][] = ["created", "linked", "replaced"];

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
  const { db, sms, hasher, clock, logger, randomInt, email } = dependencies;
  const signUpGate: SignUpGate =
    dependencies.signUpGate ?? (() => Promise.resolve(ok({ inviteCodeId: null })));
  const smsPaused = dependencies.smsPaused ?? (() => Promise.resolve(false));
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

  /**
   * A key's own count of codes sent: recovery codes are counted apart from
   * sign-in and confirm codes (spec 22, R22.6), and email codes by address.
   */
  const perNumberLimit = (purpose: CodePurpose) => {
    if (purpose === "console_recovery") {
      return { scope: "console_recovery_phone", rules: recoveryCodeSendLimits.perNumber };
    }
    // An email code is counted by its address (R26.4), so its wait is read there.
    if (purpose === "email_sign_in") return { scope: "email", rules: emailCodeSendLimits.perEmail };
    return { scope: "phone", rules: codeSendLimits.perNumber };
  };

  /** Seconds until a new code for this purpose can be sent to this number. */
  async function resendWait(
    executor: Executor,
    phoneHash: string,
    purpose: CodePurpose,
    now: Date,
  ): Promise<number> {
    const { scope, rules } = perNumberLimit(purpose);
    const check = checkRateLimits(
      await sendTimes(executor, scope, phoneHash, rules, now),
      rules,
      now,
    );
    return check.ok ? 0 : check.error.retryAfterSeconds;
  }

  /** A count a code must stay within: its scope, the keyed hash it counts by, its rules. */
  interface Limit {
    readonly scope: string;
    readonly keyHash: string;
    readonly rules: readonly RateLimitRule[];
  }

  /** When the ceiling on all texts was last reported, in this process. */
  let ceilingReportedAt = Number.NEGATIVE_INFINITY;
  const ceilingReportEveryMs = 10 * 60 * 1000;

  /** Every sign-in and confirm text together (R26.3). */
  const allTexts = (): Limit => ({
    scope: "texts",
    keyHash: hasher("texts", "all"),
    rules: textSendLimits.all,
  });

  /**
   * Stores a new code for its purpose and key under the limits, and counts
   * it; or says which limit refused. Only the newest code works: it
   * replaces the key's earlier code for the same purpose only.
   */
  async function storeCode(
    keyHash: string,
    purpose: CodePurpose,
    limits: readonly Limit[],
    code: string,
    now: Date,
  ): Promise<{ readonly scope: string; readonly error: RateLimited } | undefined> {
    return db.transaction(async (tx) => {
      // One request per key and per counted limit at a time, so two cannot
      // both pass a limit: the same number, the same waiting sign-in, or the
      // ceiling on all texts (R26.2, R26.3). The locks are taken in sorted
      // order, so two requests never wait for each other.
      const lockKeys = [
        ...new Set([keyHash, ...limits.map((limit) => `${limit.scope}:${limit.keyHash}`)]),
      ].sort();
      for (const lockKey of lockKeys) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      }
      for (const limit of limits) {
        const earlier = await sendTimes(tx, limit.scope, limit.keyHash, limit.rules, now);
        const check = checkRateLimits(earlier, limit.rules, now);
        if (!check.ok) return { scope: limit.scope, error: check.error };
      }
      await tx
        .delete(verificationCodes)
        .where(
          and(eq(verificationCodes.phoneHash, keyHash), eq(verificationCodes.purpose, purpose)),
        );
      await tx.insert(verificationCodes).values({
        phoneHash: keyHash,
        purpose,
        codeHash: hasher("code", `${keyHash}:${code}`),
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
  }

  /**
   * Texts a new code for its purpose under the limits of rule R1.3, which
   * the phone step and confirming share, with R26.3's ceiling on all texts
   * and, for the phone step, R26.2's count per waiting sign-in; a console
   * recovery code has its own count per number only (spec 22, R22.6).
   */
  async function sendCode(
    input:
      | {
          readonly e164: string;
          readonly callingCode: string;
          readonly purpose: "sign_in" | "confirm";
          readonly locale: Locale;
          readonly ipAddress: string;
          /** The waiting sign-in's keyed hash, for the phone step (R26.2). */
          readonly pendingKey?: string | undefined;
        }
      | {
          readonly e164: string;
          readonly callingCode: string;
          readonly purpose: "console_recovery";
          readonly locale: Locale;
        },
  ): Promise<Result<{ readonly resendAfterSeconds: number }, StartError>> {
    const { e164, callingCode, purpose } = input;
    // Before anything is counted or stored: a code that cannot be sent is
    // not made, and the earlier one keeps working. The console's pause never
    // stops a recovery code, so it cannot lock the operator out (R22.5).
    if (purpose !== "console_recovery" && (await smsPaused())) return err({ code: "sms_paused" });
    const now = clock();
    const phoneHash = hasher("phone", e164);
    const perNumber = { ...perNumberLimit(purpose), keyHash: phoneHash };
    const limits: Limit[] =
      input.purpose === "console_recovery"
        ? [perNumber]
        : [
            perNumber,
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
            ...(input.purpose === "sign_in" && input.pendingKey !== undefined
              ? [
                  {
                    scope: "pending_sign_in",
                    keyHash: input.pendingKey,
                    rules: textSendLimits.perPendingSignIn,
                  },
                ]
              : []),
            allTexts(),
          ];
    const code = generateCode(randomInt);
    const refused = await storeCode(phoneHash, purpose, limits, code, now);

    if (refused !== undefined) {
      if (refused.scope === "calling_code") {
        // An unusual number of codes to one country can be SMS fraud (R1.3).
        logger.warn({ callingCode }, "sign-in codes per calling code limit reached");
      }
      if (refused.scope === "texts") {
        // The ceiling on all texts (R26.3): real sign-ups wait, so the operator
        // must hear of it, through Sentry where it reports errors: once in 10
        // minutes, as refused requests are not counted and can come on end.
        if (now.getTime() - ceilingReportedAt >= ceilingReportEveryMs) {
          ceilingReportedAt = now.getTime();
          logger.error({ purpose }, "ceiling on all sign-in texts reached");
          captureError(new Error("ceiling on all sign-in texts reached"), {
            limit: "texts",
            purpose,
          });
        }
      }
      return err(refused.error);
    }

    const textKey = {
      sign_in: "sms.signInCode",
      confirm: "sms.confirmCode",
      console_recovery: "sms.consoleRecoveryCode",
    } as const;
    const text = translators[input.locale](textKey[purpose], { code });
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
   * Emails a new code (spec 26): a sign-in code keyed by the email, or a
   * confirm code keyed by the account's number, under the limits given.
   */
  async function sendEmailCode(input: {
    readonly to: string;
    readonly keyHash: string;
    readonly purpose: "email_sign_in" | "confirm";
    readonly limits: readonly Limit[];
    readonly locale: Locale;
  }): Promise<Result<{ readonly resendAfterSeconds: number }, EmailStartError>> {
    if (email === undefined) return err({ code: "email_unavailable" });
    const now = clock();
    const code = generateCode(randomInt);
    const refused = await storeCode(input.keyHash, input.purpose, input.limits, code, now);
    if (refused !== undefined) return err(refused.error);
    const content = codeEmailContent(input.purpose, input.locale, email.webAppUrl, code);
    try {
      await email.sender.send({
        to: input.to,
        ...content,
        // A new key for each code: Mailjet keeps it with the message, never the code.
        idempotencyKey: `code-${randomUUID()}`,
      });
    } catch (error) {
      // The error says why, never to whom: providers' errors carry no address.
      if (error instanceof MaybeSent) {
        // It may have arrived: the code stays, and another can be asked for.
        logger.warn({ err: error, purpose: input.purpose }, "code email may not have been sent");
      } else {
        logger.error({ err: error, purpose: input.purpose }, "code email not sent");
        return err({ code: "email_failed" });
      }
    }
    logger.info({ purpose: input.purpose }, "code emailed");
    return ok({ resendAfterSeconds: emailCodeSendLimits.perEmail[0].windowSeconds });
  }

  /**
   * Checks the newest code of a number for its purpose. A wrong one is
   * counted. A right one is locked and its ID returned: the caller uses it
   * up with `useUpCode` (single use, spec 1, section 7), or keeps it for
   * another try.
   */
  async function checkCode(
    tx: Transaction,
    phoneHash: string,
    purpose: CodePurpose,
    code: string,
    now: Date,
  ): Promise<Result<{ readonly codeId: string }, ConfirmError>> {
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
        ? err({
            ...attempt.error,
            retryAfterSeconds: await resendWait(tx, phoneHash, purpose, now),
          })
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
            retryAfterSeconds: await resendWait(tx, phoneHash, purpose, now),
          })
        : err({ code: "code_invalid", attemptsLeft });
    }

    return ok({ codeId: stored.id });
  }

  const useUpCode = (tx: Transaction, codeId: string) =>
    tx.delete(verificationCodes).where(eq(verificationCodes.id, codeId));

  /**
   * Checks the newest code of a number for its purpose, then runs the action
   * in the same transaction. A wrong code is counted and the action does not
   * run. The code is used up only when the action succeeds: when it returns
   * an error or throws, its changes are rolled back and the code still works.
   */
  async function withCode<T, E>(
    numberOf: (tx: Transaction) => Promise<string | null>,
    purpose: CodePurpose,
    code: string,
    action: (tx: Transaction) => Promise<Result<T, E>>,
  ): Promise<Result<T, ConfirmError | E>> {
    const now = clock();
    let refused: { readonly error: E } | undefined;
    try {
      return await db.transaction(async (tx): Promise<Result<T, ConfirmError | E>> => {
        const e164 = await numberOf(tx);
        if (e164 === null) return err({ code: "code_expired" });
        // A wrong code returns, so the transaction commits its count.
        const checked = await checkCode(tx, hasher("phone", e164), purpose, code, now);
        if (!checked.ok) return checked;
        await useUpCode(tx, checked.value.codeId);
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
  }

  /** Counts a try against a code, as a wrong text-message code would. */
  const countAttempt = (tx: Transaction, codeId: string, now: Date) =>
    tx
      .update(verificationCodes)
      .set({ attempts: sql`${verificationCodes.attempts} + 1`, updatedAt: now })
      .where(eq(verificationCodes.id, codeId));

  /**
   * The phone step's transaction: checks the code, then signs in to the
   * number's account or makes it, and, with a waiting Google or Apple
   * sign-in, links it (spec 19, 3.3; plan 4.2).
   */
  async function verifyIn(
    tx: Transaction,
    input: Parameters<AuthService["verify"]>[0] & {
      readonly e164: string;
      readonly phoneHash: string;
      readonly now: Date;
    },
  ): Promise<Result<SignedIn, VerifyError>> {
    const { e164, phoneHash, now } = input;
    // First, so a sign-in that took too long leaves the code unused (3.3, item 5).
    let pending: PendingSignIn | null = null;
    let pendingEmail: PendingEmailSignIn | null = null;
    if (isEmailSignIn(input.pendingSignIn)) {
      pendingEmail = await lockPendingEmailSignIn(tx, input.pendingSignIn, now);
      if (pendingEmail === null) return err({ code: "provider_expired" });
    } else {
      pending = await lockPendingSignIn(tx, input.pendingSignIn, now, null);
      if (pending === null) return err({ code: "provider_expired" });
    }

    const checked = await checkCode(tx, phoneHash, "sign_in", input.code, now);
    if (!checked.ok) return checked;
    const { codeId } = checked.value;

    let [user] = await tx
      .select({
        id: users.id,
        status: users.status,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        locale: users.locale,
      })
      .from(users)
      .where(eq(users.phoneE164, e164))
      .for("update");
    const isNewUser = user === undefined;
    const accountEmail = user?.email;
    // Only an address the person proved is told of a change (R26.6).
    const verifiedEmail =
      user === undefined || user.emailVerifiedAt === null ? null : (accountEmail ?? null);
    const decision =
      pending === null
        ? null
        : decideLink({
            via: "phone",
            accountId: user?.id ?? null,
            ...(await linkStateOf(tx, { ...pending, accountId: user?.id ?? null })),
          });
    // No account is made for a provider account another one has; the code stays.
    if (user === undefined && decision?.action === "refuse") {
      return err({ code: "provider_in_use" });
    }
    if (user === undefined) {
      // The number of a suspended person whose data was erased cannot
      // sign up again until the suspension would have ended (R11.9).
      const [blocked] = await tx
        .select({ until: blockedNumbers.until })
        .from(blockedNumbers)
        .where(and(eq(blockedNumbers.phoneHash, phoneHash), gt(blockedNumbers.until, now)));
      if (blocked !== undefined) {
        await useUpCode(tx, codeId);
        return err({ code: "account_unavailable" });
      }
      // The closed beta (spec 12, R12.1): refused, the text-message code
      // is kept, so the app can ask for the invite code and send both.
      // A wrong invite code counts as a try, so guessing is held to the
      // tries of sign-in; asking for one, or a full beta, does not.
      const admitted = await signUpGate(tx, input.inviteCode, now);
      if (!admitted.ok) {
        if (admitted.error.code === "invite_invalid") await countAttempt(tx, codeId, now);
        return admitted;
      }
      [user] = await tx
        .insert(users)
        .values({
          phoneE164: e164,
          phoneVerifiedAt: now,
          locale: input.locale,
          inviteCodeId: admitted.value.inviteCodeId,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: users.id,
          status: users.status,
          email: users.email,
          emailVerifiedAt: users.emailVerifiedAt,
          locale: users.locale,
        });
      if (user === undefined) throw new Error("The new user was not stored.");
    }
    await useUpCode(tx, codeId);
    if (!canSignIn(user.status)) return err({ code: "account_unavailable" });

    const providerLink =
      pending === null || decision === null
        ? undefined
        : await applyLink(tx, { decision, pending, userId: user.id, now });
    const emailLink =
      pendingEmail === null
        ? undefined
        : await takeEmail(tx, {
            pending: pendingEmail,
            userId: user.id,
            accountEmail: isNewUser ? undefined : (accountEmail ?? null),
            now,
          });

    const { sessionId, tokens } = await openSession(tx, {
      userId: user.id,
      device: input.device,
      now,
    });

    logger.info({ userId: user.id, sessionId, isNewUser }, "signed in");
    // A new way into the account (spec 19, section 6), for the audit trail.
    if (providerLink !== undefined && linkingOutcomes.includes(providerLink.outcome)) {
      logger.info(
        { userId: user.id, provider: providerLink.provider, outcome: providerLink.outcome },
        "sign-in method linked",
      );
    }
    if (emailLink !== undefined) {
      logger.info(
        { userId: user.id, outcome: emailLink.outcome },
        "sign-in email at the phone step",
      );
    }
    const oldEmail = emailLink?.outcome === "replaced" ? verifiedEmail : null;
    return ok({
      userId: user.id,
      sessionId,
      platform: input.device.platform,
      isNewUser,
      tokens,
      ...(providerLink === undefined ? {} : { providerLink }),
      ...(isNewUser && pending !== null && pending.firstName !== null
        ? { suggestedFirstName: pending.firstName }
        : {}),
      ...(emailLink === undefined ? {} : { emailLink }),
      ...(oldEmail === null || emailLink === undefined
        ? {}
        : {
            emailChanged: {
              oldEmail,
              newEmail: emailLink.email,
              locale: user.locale === "is" ? ("is" as const) : ("en" as const),
            },
          }),
    });
  }

  /**
   * The phone step's part of an email sign-in (spec 26, 3.3, item 3): puts
   * the proven email on the account when R26.5 allows, in a savepoint so a
   * race on the address leaves the email as it was, and ends the waiting
   * sign-in.
   */
  async function takeEmail(
    tx: Transaction,
    input: {
      readonly pending: PendingEmailSignIn;
      readonly userId: string;
      /** Undefined for an account the phone step just made. */
      readonly accountEmail: string | null | undefined;
      readonly now: Date;
    },
  ): Promise<EmailLink> {
    const { pending, userId, now } = input;
    await tx.delete(emailSignIns).where(eq(emailSignIns.id, pending.id));
    const [other] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, pending.email), ne(users.id, userId)))
      .limit(1);
    const outcome = emailAtPhoneStep({
      accountEmail: input.accountEmail,
      newEmail: pending.email,
      takenByOther: other !== undefined,
    });
    if (outcome === "in_use") return { outcome, email: pending.email };
    if (outcome === "already") {
      // Proven now, if it was still waiting for its link.
      await tx
        .update(users)
        .set({ emailVerifiedAt: now, updatedAt: now })
        .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
      return { outcome, email: pending.email };
    }
    try {
      await tx.transaction((savepoint) =>
        savepoint
          .update(users)
          .set({ email: pending.email, emailVerifiedAt: now, updatedAt: now })
          .where(eq(users.id, userId)),
      );
    } catch (error) {
      if (!uniqueViolation(error, "users_email_unique")) throw error;
      return { outcome: "in_use", email: pending.email };
    }
    // A link sent earlier for another address stops working, as if used,
    // so it cannot later take the place of the email proven now.
    await tx
      .update(emailVerifications)
      .set({ usedAt: now, updatedAt: now })
      .where(and(eq(emailVerifications.userId, userId), isNull(emailVerifications.usedAt)));
    return { outcome, email: pending.email };
  }

  /** Whether a waiting sign-in is an email's (`sr_pe_…`) rather than Google's or Apple's. */
  const isEmailSignIn = (token: string) => token.startsWith("sr_pe_");

  /** Locks a waiting email sign-in by its token: less than 30 minutes old. Null when there is none. */
  async function lockPendingEmailSignIn(
    tx: Transaction,
    token: string,
    now: Date,
  ): Promise<PendingEmailSignIn | null> {
    const [row] = await tx
      .select({ id: emailSignIns.id, email: emailSignIns.email })
      .from(emailSignIns)
      .where(and(eq(emailSignIns.pendingHash, hashToken(token)), gt(emailSignIns.expiresAt, now)))
      .for("update");
    return row ?? null;
  }

  /** Whether a waiting email, Google or Apple sign-in can still take the phone step. */
  async function isWaiting(token: string, now: Date): Promise<boolean> {
    if (isEmailSignIn(token)) {
      const [row] = await db
        .select({ id: emailSignIns.id })
        .from(emailSignIns)
        .where(
          and(eq(emailSignIns.pendingHash, hashToken(token)), gt(emailSignIns.expiresAt, now)),
        );
      return row !== undefined;
    }
    const [row] = await db
      .select({ id: providerSignIns.id })
      .from(providerSignIns)
      .where(
        and(
          eq(providerSignIns.pendingHash, hashToken(token)),
          gt(providerSignIns.expiresAt, now),
          isNotNull(providerSignIns.answeredAt),
          isNull(providerSignIns.linkUserId),
        ),
      );
    return row !== undefined;
  }

  return {
    async start(input) {
      const phone = normalisePhoneNumber(input.phoneNumber);
      if (!phone.ok) return err(phone.error);
      // No text without a waiting sign-in (R26.2).
      if (!(await isWaiting(input.pendingSignIn, clock())))
        return err({ code: "provider_expired" });
      return sendCode({
        ...phone.value,
        purpose: "sign_in",
        locale: input.locale,
        ipAddress: input.ipAddress,
        pendingKey: hasher("pending-sign-in", input.pendingSignIn),
      });
    },

    async startEmail(input) {
      const address = normaliseEmail(input.email);
      if (!address.ok) return address;
      const keyHash = hasher("email", address.value);
      return sendEmailCode({
        to: address.value,
        keyHash,
        purpose: "email_sign_in",
        locale: input.locale,
        limits: [
          { scope: "email", keyHash, rules: emailCodeSendLimits.perEmail },
          {
            scope: "email_ip",
            keyHash: hasher("ip", addressBlock(input.ipAddress)),
            rules: emailCodeSendLimits.perIpAddress,
          },
        ],
      });
    },

    async verifyEmail(input) {
      const address = normaliseEmail(input.email);
      if (!address.ok) return address;
      const keyHash = hasher("email", address.value);
      const now = clock();
      return db.transaction(async (tx): Promise<Result<EmailVerified, EmailVerifyError>> => {
        // A wrong code returns, so the transaction commits its count.
        const checked = await checkCode(tx, keyHash, "email_sign_in", input.code, now);
        if (!checked.ok) return checked;
        await useUpCode(tx, checked.value.codeId);
        // Only a verified email signs in: one waiting for its link is not the account's yet.
        const [user] = await tx
          .select({ id: users.id, status: users.status })
          .from(users)
          .where(and(eq(users.email, address.value), isNotNull(users.emailVerifiedAt)))
          .for("update");
        if (user === undefined) {
          // A newcomer, or a member whose account has another email or none:
          // the phone step finds out (3.3).
          const pendingSignIn = newToken("pendingEmailSignIn");
          const expiresAt = addSeconds(now, emailSignInRules.waitingSeconds);
          await tx.insert(emailSignIns).values({
            email: address.value,
            pendingHash: hashToken(pendingSignIn),
            expiresAt,
            createdAt: now,
            updatedAt: now,
          });
          logger.info({}, "email sign-in waiting for the phone step");
          return ok({
            status: "phoneNeeded",
            pendingSignIn,
            provider: "email",
            email: address.value,
            firstName: null,
            expiresAt,
          });
        }
        // As a phone sign-in: a suspended person signs in, an account waiting to be deleted too.
        if (!canSignIn(user.status)) return err({ code: "account_unavailable" });
        const { sessionId, tokens } = await openSession(tx, {
          userId: user.id,
          device: input.device,
          now,
        });
        logger.info({ userId: user.id, sessionId, isNewUser: false, via: "email" }, "signed in");
        return ok({
          status: "signedIn",
          userId: user.id,
          sessionId,
          platform: input.device.platform,
          isNewUser: false,
          tokens,
        });
      });
    },

    async verify(input) {
      const phone = normalisePhoneNumber(input.phoneNumber);
      if (!phone.ok) return err(phone.error);
      const { e164 } = phone.value;
      const now = clock();
      const phoneHash = hasher("phone", e164);

      const signIn = (tx: Transaction): Promise<Result<SignedIn, VerifyError>> =>
        verifyIn(tx, { ...input, e164, phoneHash, now });
      try {
        const signedIn = await db.transaction(signIn);
        if (signedIn.ok && signedIn.value.emailChanged !== undefined) {
          await sendEmailChangedNotice(email, logger, {
            userId: signedIn.value.userId,
            ...signedIn.value.emailChanged,
          });
        }
        return signedIn;
      } catch (error) {
        // Two phone steps with one Google or Apple account at once: the
        // unique index lets one through, and the other makes nothing and
        // keeps its code (plan, review focus 4).
        if (uniqueViolation(error, subjectTakenConstraint)) {
          return err({ code: "provider_in_use" });
        }
        throw error;
      }
    },

    async refresh(refreshToken) {
      const now = clock();
      return db.transaction(async (tx): Promise<Result<Refreshed, RefreshError>> => {
        // Locks the token and its session, so two refreshes of one session run
        // in turn; not the account, which deleting one locks before it ends
        // the sessions.
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
          .for("update", { of: [sessionTokens, sessions] });
        if (row === undefined) return err({ code: "refresh_invalid" });
        const { token, session } = row;
        if (!canSignIn(row.userStatus)) {
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
            inArray(users.status, signInStatuses),
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
        .select({
          phoneE164: users.phoneE164,
          locale: users.locale,
          email: users.email,
          emailVerifiedAt: users.emailVerifiedAt,
        })
        .from(users)
        .where(eq(users.id, input.userId));
      if (user === undefined || user.phoneE164 === null) {
        throw new Error("The signed-in user has no phone number.");
      }
      const locale = user.locale === "is" ? "is" : "en";
      // The stored number as it is, so the code is kept under the same hash
      // that withConfirmCode looks for, even if the number would no longer
      // pass today's checks; its calling code only sets the limits and logs.
      // By email or by text, it is the number's confirm code (R26.7).
      const phoneHash = hasher("phone", user.phoneE164);
      const verifiedEmail = user.emailVerifiedAt === null ? null : user.email;
      if (confirmChannel(verifiedEmail !== null && email !== undefined) === "email") {
        const address = verifiedEmail ?? "";
        const sent = await sendEmailCode({
          to: address,
          keyHash: phoneHash,
          purpose: "confirm",
          locale,
          limits: [
            { ...perNumberLimit("confirm"), keyHash: phoneHash },
            {
              scope: "email_ip",
              keyHash: hasher("ip", addressBlock(input.ipAddress)),
              rules: emailCodeSendLimits.perIpAddress,
            },
          ],
        });
        if (!sent.ok) return sent;
        return ok({ ...sent.value, channel: "email", sentTo: hideEmail(address) });
      }
      const phone = normalisePhoneNumber(user.phoneE164);
      const sent = await sendCode({
        e164: user.phoneE164,
        callingCode: phone.ok ? phone.value.callingCode : "unknown",
        purpose: "confirm",
        locale,
        ipAddress: input.ipAddress,
      });
      if (!sent.ok) return sent;
      return ok({ ...sent.value, channel: "sms", sentTo: user.phoneE164.slice(-2) });
    },

    async withConfirmCode<T, E>(
      userId: string,
      code: string,
      action: (tx: Transaction) => Promise<Result<T, E>>,
    ): Promise<Result<T, ConfirmError | E>> {
      return withCode(
        async (tx) => {
          const [user] = await tx
            .select({ phoneE164: users.phoneE164 })
            .from(users)
            .where(eq(users.id, userId));
          return user?.phoneE164 ?? null;
        },
        "confirm",
        code,
        action,
      );
    },

    async sendRecoveryCode(input) {
      // The stored number as it is, as for a confirm code.
      const phone = normalisePhoneNumber(input.e164);
      return sendCode({
        e164: input.e164,
        callingCode: phone.ok ? phone.value.callingCode : "unknown",
        purpose: "console_recovery",
        locale: input.locale,
      });
    },

    async withRecoveryCode<T, E>(
      e164: string,
      code: string,
      action: (tx: Transaction) => Promise<Result<T, E>>,
    ): Promise<Result<T, ConfirmError | E>> {
      return withCode(() => Promise.resolve(e164), "console_recovery", code, action);
    },
  };
}
