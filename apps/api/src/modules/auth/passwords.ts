import { readFileSync } from "node:fs";
import { schema, type Database } from "@shareride/db";
import {
  checkNewPassword,
  checkRateLimits,
  err,
  needsProof,
  normaliseEmail,
  ok,
  passwordSignInLimits,
  type RateLimited,
  type RateLimitRule,
  type Result,
} from "@shareride/domain";
import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
import type { Logger } from "../../logger.ts";
import { addressBlock } from "../../platform/client-address.ts";
import type { KeyedHasher } from "../../platform/crypto.ts";
import type { EmailChannel } from "../../platform/email.ts";
import { hashPassword, verifyPassword } from "../../platform/passwords.ts";
import { sendSignInChangeNotice, type SignInChange } from "./emails.ts";
import {
  canSignIn,
  type AuthService,
  type ConfirmError,
  type Device,
  type IssuedTokens,
  type Transaction,
} from "./service.ts";
import { openSession } from "./sessions.ts";

// Members' passwords (spec 27, ADR 0047): optional, the verified email as the
// user name, stored only as a scrypt hash. A forgotten one is no problem: the
// email code still signs in.

const { memberPasswords, rateLimitEvents, sessions, users } = schema;

/** The passwords too common to use (R27.2), lowercased, read once. */
let common: ReadonlySet<string> | undefined;
export function isCommonPassword(lowered: string): boolean {
  common ??= new Set(
    readFileSync(new URL("../../../assets/common-passwords.txt", import.meta.url), "utf8")
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("#")),
  );
  return common.has(lowered);
}

export type PasswordSignInError =
  { readonly code: "credentials_invalid" } | { readonly code: "account_unavailable" } | RateLimited;

export interface PasswordSignedIn {
  readonly userId: string;
  readonly sessionId: string;
  readonly tokens: IssuedTokens;
}

export type SetPasswordError =
  | { readonly code: "password_too_short" }
  | { readonly code: "password_too_long" }
  | { readonly code: "password_too_common" }
  | { readonly code: "password_is_email" }
  | { readonly code: "email_required" }
  | { readonly code: "confirm_required" }
  | ConfirmError;

export interface PasswordService {
  /** Signs in with the account's verified email and its password (3.2). */
  signIn(input: {
    readonly email: string;
    readonly password: string;
    readonly device: Device;
    readonly ipAddress: string;
  }): Promise<Result<PasswordSignedIn, PasswordSignInError>>;
  /**
   * Adds or changes the password (3.5): with `code` unless this session
   * signed in less than 10 minutes ago (R27.5). The verified email is told.
   */
  set(input: {
    readonly userId: string;
    readonly sessionId: string;
    readonly password: string;
    readonly code?: string;
  }): Promise<Result<{ readonly setAt: Date }, SetPasswordError>>;
  /** Removes the password; false when there was none. The verified email is told. */
  remove(userId: string): Promise<boolean>;
  /** When the password was last set, or null when there is none. */
  setAt(userId: string): Promise<Date | null>;
}

export interface PasswordServiceDependencies {
  readonly db: Database;
  readonly clock: () => Date;
  readonly logger: Logger;
  readonly hasher: KeyedHasher;
  readonly auth: Pick<AuthService, "withConfirmCode">;
  readonly email?: EmailChannel;
  /** The list of R27.2; the API's own file unless a test gives another. */
  readonly isCommon?: (lowered: string) => boolean;
}

const problemCodes = {
  too_short: "password_too_short",
  too_long: "password_too_long",
  too_common: "password_too_common",
  is_email: "password_is_email",
} as const;

export function createPasswordService(dependencies: PasswordServiceDependencies): PasswordService {
  const { db, clock, logger, hasher, auth, email } = dependencies;
  const isCommon = dependencies.isCommon ?? isCommonPassword;

  /** Checked against when there is no hash, so a wrong answer takes as long either way (R27.4). */
  let dummy: Promise<string> | undefined;
  const dummyHash = () => (dummy ??= hashPassword("not a password anyone has"));

  interface Limit {
    readonly scope: string;
    readonly keyHash: string;
    readonly rules: readonly RateLimitRule[];
  }

  async function wrongTries(tx: Transaction, limit: Limit, now: Date): Promise<Date[]> {
    const longest = Math.max(...limit.rules.map((rule) => rule.windowSeconds));
    const rows = await tx
      .select({ createdAt: rateLimitEvents.createdAt })
      .from(rateLimitEvents)
      .where(
        and(
          eq(rateLimitEvents.scope, limit.scope),
          eq(rateLimitEvents.keyHash, limit.keyHash),
          gt(rateLimitEvents.createdAt, new Date(now.getTime() - longest * 1000)),
        ),
      );
    return rows.map((row) => row.createdAt);
  }

  async function notify(userId: string, change: SignInChange): Promise<void> {
    const [user] = await db
      .select({ email: users.email, verifiedAt: users.emailVerifiedAt, locale: users.locale })
      .from(users)
      .where(eq(users.id, userId));
    if (user === undefined || user.email === null || user.verifiedAt === null) return;
    await sendSignInChangeNotice(email, logger, {
      userId,
      to: user.email,
      locale: user.locale === "is" ? "is" : "en",
      change,
    });
  }

  return {
    async signIn(input) {
      const address = normaliseEmail(input.email);
      // Not an address: no account has it, and the answer is the same.
      const emailKey = hasher("email", address.ok ? address.value : input.email.trim());
      const limits: Limit[] = [
        { scope: "password_email", keyHash: emailKey, rules: passwordSignInLimits.perEmail },
        {
          scope: "password_ip",
          keyHash: hasher("ip", addressBlock(input.ipAddress)),
          rules: passwordSignInLimits.perIpAddress,
        },
      ];
      const now = clock();
      return db.transaction(async (tx): Promise<Result<PasswordSignedIn, PasswordSignInError>> => {
        // One try at a time per email and per network address, so two
        // cannot both pass a limit; in sorted order, so none wait in a ring.
        for (const key of limits.map((limit) => `${limit.scope}:${limit.keyHash}`).sort()) {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
        }
        for (const limit of limits) {
          const allowed = checkRateLimits(await wrongTries(tx, limit, now), limit.rules, now);
          if (!allowed.ok) return allowed;
        }
        const [account] = address.ok
          ? await tx
              .select({ id: users.id, status: users.status, hash: memberPasswords.hash })
              .from(users)
              .innerJoin(memberPasswords, eq(memberPasswords.userId, users.id))
              .where(and(eq(users.email, address.value), isNotNull(users.emailVerifiedAt)))
          : [];
        const password = input.password.normalize("NFC");
        const checked = await verifyPassword(password, account?.hash ?? (await dummyHash()));
        if (account === undefined || !checked.ok) {
          // A wrong try returns, so the transaction commits its count.
          await tx.insert(rateLimitEvents).values(
            limits.map((limit) => ({
              scope: limit.scope,
              keyHash: limit.keyHash,
              createdAt: now,
              updatedAt: now,
            })),
          );
          logger.info({}, "wrong password");
          return err({ code: "credentials_invalid" });
        }
        // Only now, with the right password: whether the account may sign in.
        if (!canSignIn(account.status)) return err({ code: "account_unavailable" });
        if (checked.outdated) {
          await tx
            .update(memberPasswords)
            .set({ hash: await hashPassword(password), updatedAt: now })
            .where(eq(memberPasswords.userId, account.id));
        }
        const { sessionId, tokens } = await openSession(tx, {
          userId: account.id,
          device: input.device,
          now,
        });
        logger.info(
          { userId: account.id, sessionId, isNewUser: false, via: "password" },
          "signed in",
        );
        return ok({ userId: account.id, sessionId, tokens });
      });
    },

    async set(input) {
      const { userId } = input;
      const [user] = await db
        .select({ email: users.email, verifiedAt: users.emailVerifiedAt })
        .from(users)
        .where(eq(users.id, userId));
      if (user === undefined) throw new Error("The signed-in user does not exist.");
      if (user.email === null || user.verifiedAt === null) return err({ code: "email_required" });
      const checked = checkNewPassword(input.password, user.email, isCommon);
      if (!checked.ok) return err({ code: problemCodes[checked.error] });
      const [session] = await db
        .select({ startedAt: sessions.createdAt })
        .from(sessions)
        .where(eq(sessions.id, input.sessionId));
      if (session === undefined) throw new Error("The session does not exist.");
      const now = clock();
      const proofNeeded = needsProof(session.startedAt, now);
      if (proofNeeded && input.code === undefined) return err({ code: "confirm_required" });
      // Hashed before the transaction, which then stays short.
      const hash = await hashPassword(checked.value);
      const save = async (
        tx: Transaction,
      ): Promise<Result<{ readonly changed: boolean }, never>> => {
        const [before] = await tx
          .select({ userId: memberPasswords.userId })
          .from(memberPasswords)
          .where(eq(memberPasswords.userId, userId))
          .for("update");
        await tx
          .insert(memberPasswords)
          .values({ userId, hash, createdAt: now, updatedAt: now })
          .onConflictDoUpdate({ target: memberPasswords.userId, set: { hash, updatedAt: now } });
        return ok({ changed: before !== undefined });
      };
      const saved: Result<{ readonly changed: boolean }, ConfirmError> =
        proofNeeded && input.code !== undefined
          ? await auth.withConfirmCode(userId, input.code, save)
          : await db.transaction(save);
      if (!saved.ok) return saved;
      logger.info({ userId }, "password set");
      await notify(userId, { kind: saved.value.changed ? "password_changed" : "password_added" });
      return ok({ setAt: now });
    },

    async remove(userId) {
      const removed = await db
        .delete(memberPasswords)
        .where(eq(memberPasswords.userId, userId))
        .returning({ userId: memberPasswords.userId });
      if (removed.length === 0) return false;
      logger.info({ userId }, "password removed");
      await notify(userId, { kind: "password_removed" });
      return true;
    },

    async setAt(userId) {
      const [row] = await db
        .select({ updatedAt: memberPasswords.updatedAt })
        .from(memberPasswords)
        .where(eq(memberPasswords.userId, userId));
      return row?.updatedAt ?? null;
    },
  };
}
