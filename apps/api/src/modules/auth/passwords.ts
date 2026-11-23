import { readFileSync } from "node:fs";
import { schema, type Database } from "@shareride/db";
import {
  checkNewPassword,
  checkRateLimits,
  err,
  needsProof,
  normaliseEmail,
  ok,
  passwordChangeLimits,
  passwordSignInLimits,
  type RateLimited,
  type RateLimitRule,
  type Result,
} from "@shareride/domain";
import { and, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import type { Logger } from "../../logger.ts";
import { addressBlock } from "../../platform/client-address.ts";
import type { KeyedHasher } from "../../platform/crypto.ts";
import type { EmailChannel } from "../../platform/email.ts";
import { createHashGate, hashPassword, verifyPassword } from "../../platform/passwords.ts";
import { tellVerifiedEmail, type SignInChange } from "./emails.ts";
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
  }): Promise<Result<{ readonly setAt: Date }, SetPasswordError | RateLimited>>;
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

/** Two hashes at a time, 64 MiB together, and 20 more waiting (ADR 0047). */
const gateSize = { running: 2, waiting: 20 } as const;

/** The wait suggested when the hashes are all busy. */
const busySeconds = 5;

const problemCodes = {
  too_short: "password_too_short",
  too_long: "password_too_long",
  too_common: "password_too_common",
  is_email: "password_is_email",
} as const;

export function createPasswordService(dependencies: PasswordServiceDependencies): PasswordService {
  const { db, clock, logger, hasher, auth, email } = dependencies;
  const isCommon = dependencies.isCommon ?? isCommonPassword;

  const gate = createHashGate(gateSize);
  const busy = { code: "rate_limited", retryAfterSeconds: busySeconds } as const;

  /**
   * Checked against when there is no hash, so a wrong answer takes as long
   * either way (R27.4); made now, not at the first unknown email.
   */
  const dummy = hashPassword("not a password anyone has");
  dummy.catch(() => {});

  interface Limit {
    readonly scope: string;
    readonly keyHash: string;
    readonly rules: readonly RateLimitRule[];
  }

  /**
   * Takes the limits' locks, in sorted order so none wait in a ring, and
   * checks them; the try counts only if `reserve` is called before the
   * transaction ends.
   */
  async function lockAndCheck(
    tx: Transaction,
    limits: readonly Limit[],
    now: Date,
  ): Promise<Result<undefined, RateLimited & { readonly scope: string }>> {
    for (const key of [
      ...new Set(limits.map((limit) => `${limit.scope}:${limit.keyHash}`)),
    ].sort()) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    }
    for (const limit of limits) {
      const allowed = checkRateLimits(await triesIn(tx, limit, now), limit.rules, now);
      if (!allowed.ok) return err({ ...allowed.error, scope: limit.scope });
    }
    return ok(undefined);
  }

  /** Counts this try under each limit; the events' ids, to take back a right one. */
  async function reserve(tx: Transaction, limits: readonly Limit[], now: Date): Promise<string[]> {
    const rows = await tx
      .insert(rateLimitEvents)
      .values(
        limits.map((limit) => ({
          scope: limit.scope,
          keyHash: limit.keyHash,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .returning({ id: rateLimitEvents.id });
    return rows.map((row) => row.id);
  }

  async function triesIn(tx: Transaction, limit: Limit, now: Date): Promise<Date[]> {
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

  const notify = (userId: string, change: SignInChange) =>
    tellVerifiedEmail({ db, email, logger }, userId, change);

  return {
    async signIn(input) {
      const address = normaliseEmail(input.email);
      // Not an address: no account has it, and the answer is the same.
      const emailKey = hasher("email", address.ok ? address.value : input.email.trim());
      const ipKey = hasher("ip", addressBlock(input.ipAddress));
      const wrong: Limit[] = [
        { scope: "password_email", keyHash: emailKey, rules: passwordSignInLimits.perEmail },
        { scope: "password_ip", keyHash: ipKey, rules: passwordSignInLimits.perIpAddress },
      ];
      const all: Limit[] = [
        { scope: "password_try_email", keyHash: emailKey, rules: passwordSignInLimits.allPerEmail },
        { scope: "password_try_ip", keyHash: ipKey, rules: passwordSignInLimits.allPerIpAddress },
      ];
      const now = clock();
      // 1. Quickly, under the limits' locks: the try is counted as wrong
      // before it is checked, so tries at the same moment cannot pass a
      // limit together, and the account's hash is read.
      const counted = await db.transaction(async (tx) => {
        const allowed = await lockAndCheck(tx, [...wrong, ...all], now);
        if (!allowed.ok) return allowed;
        const reserved = await reserve(tx, wrong, now);
        await reserve(tx, all, now);
        const [account] = address.ok
          ? await tx
              .select({ id: users.id, hash: memberPasswords.hash })
              .from(users)
              .innerJoin(memberPasswords, eq(memberPasswords.userId, users.id))
              .where(and(eq(users.email, address.value), isNotNull(users.emailVerifiedAt)))
          : [];
        return ok({ reserved, account });
      });
      if (!counted.ok) {
        const { scope, ...limited } = counted.error;
        logger.info({ scope }, "password tries limited");
        return err(limited);
      }
      const { reserved, account } = counted.value;
      // 2. The slow part, holding no database connection.
      const password = input.password.normalize("NFC");
      const hash = account?.hash ?? (await dummy);
      const checked = await gate.run(() => verifyPassword(password, hash));
      if (checked === null) {
        // Not checked: the try was not wrong.
        await db.delete(rateLimitEvents).where(inArray(rateLimitEvents.id, reserved));
        logger.warn({}, "password checks busy");
        return err(busy);
      }
      if (account === undefined || !checked.ok) {
        logger.info({}, "wrong password");
        return err({ code: "credentials_invalid" });
      }
      const newHash = checked.outdated ? await gate.run(() => hashPassword(password)) : null;
      // 3. Quickly: the try was right, so it is taken back from the wrong ones.
      return db.transaction(async (tx): Promise<Result<PasswordSignedIn, PasswordSignInError>> => {
        const [current] = await tx
          .select({ status: users.status, hash: memberPasswords.hash })
          .from(users)
          .innerJoin(memberPasswords, eq(memberPasswords.userId, users.id))
          .where(eq(users.id, account.id))
          .for("update", { of: memberPasswords });
        // Changed or removed meanwhile: the password checked is not the account's now.
        if (current?.hash !== account.hash) return err({ code: "credentials_invalid" });
        await tx.delete(rateLimitEvents).where(inArray(rateLimitEvents.id, reserved));
        // Only now, with the right password: whether the account may sign in.
        if (!canSignIn(current.status)) return err({ code: "account_unavailable" });
        if (newHash !== null) {
          // Stronger settings; when it was chosen stays as it was.
          await tx
            .update(memberPasswords)
            .set({ hash: newHash, updatedAt: now })
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
      // Each save costs a hash and an email: 10 an hour (R27.4), counted first.
      const changes: Limit = {
        scope: "password_set",
        keyHash: hasher("user", userId),
        rules: passwordChangeLimits,
      };
      const counted = await db.transaction(async (tx) => {
        const allowed = await lockAndCheck(tx, [changes], now);
        if (allowed.ok) await reserve(tx, [changes], now);
        return allowed;
      });
      if (!counted.ok) {
        const { scope, ...limited } = counted.error;
        logger.info({ userId, scope }, "password saves limited");
        return err(limited);
      }
      // Hashed before the transaction, which then stays short.
      const hash = await gate.run(() => hashPassword(checked.value));
      if (hash === null) return err(busy);
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
          .values({ userId, hash, setAt: now, createdAt: now, updatedAt: now })
          .onConflictDoUpdate({
            target: memberPasswords.userId,
            set: { hash, setAt: now, updatedAt: now },
          });
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
        .select({ setAt: memberPasswords.setAt })
        .from(memberPasswords)
        .where(eq(memberPasswords.userId, userId));
      return row?.setAt ?? null;
    },
  };
}
