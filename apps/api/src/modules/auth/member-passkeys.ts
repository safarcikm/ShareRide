import type { MemberPasskey } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  deviceName,
  err,
  memberPasskeyRules,
  needsProof,
  ok,
  type Result,
} from "@shareride/domain";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { and, asc, count, desc, eq, gt, notInArray } from "drizzle-orm";
import type { Logger } from "../../logger.ts";
import type { KeyedHasher } from "../../platform/crypto.ts";
import type { EmailChannel } from "../../platform/email.ts";
import type { WebAuthnOptions } from "../admin/passkeys.ts";
import { tellVerifiedEmail } from "./emails.ts";
import {
  canSignIn,
  type AuthService,
  type ConfirmError,
  type Device,
  type IssuedTokens,
  type Transaction,
} from "./service.ts";
import { openSession } from "./sessions.ts";

// Members' Face ID or fingerprint (spec 27, 3.3 and 3.6; ADR 0048): a
// passkey kept on the device, apart from the console's own. The browser's
// sheet lists every passkey of the site, the console's too; only a member's
// signs in here.

const { memberPasskeyChallenges, memberPasskeys, operatorPasskeys, sessions, users } = schema;

export interface PasskeyInvalid {
  readonly code: "passkey_invalid";
}
/**
 * The passkey is in neither table: removed, or from a test, so the browser
 * may forget it (spec 28, 3.4). The console's own is `passkey_invalid`.
 */
export interface PasskeyUnknown {
  readonly code: "passkey_unknown";
}
export interface TooMany {
  readonly code: "too_many";
}
/** The sheet's challenge is gone: answered too late, or used already. */
export interface PasskeyExpired {
  readonly code: "passkey_expired";
}
export type PasskeySignInError =
  | PasskeyInvalid
  | PasskeyUnknown
  | PasskeyExpired
  | { readonly code: "account_unavailable" };
export type PasskeySetupError = { readonly code: "confirm_required" } | TooMany | ConfirmError;

export interface PasskeySignedIn {
  readonly userId: string;
  readonly sessionId: string;
  readonly tokens: IssuedTokens;
}

export interface MemberPasskeyService {
  /** Options for the browser's sheet, for any of the site's passkeys (3.3). */
  signInOptions(): Promise<WebAuthnOptions>;
  /**
   * Signs in with a member's passkey; one the site does not have is
   * `passkey_unknown`, the console's or any other bad answer
   * `passkey_invalid`, and one to a challenge that is gone `passkey_expired`.
   */
  signIn(input: {
    readonly credential: AuthenticationResponseJSON;
    readonly device: Device;
  }): Promise<Result<PasskeySignedIn, PasskeySignInError>>;
  /**
   * Options for a new passkey on this device (3.6): with `code` unless this
   * session signed in less than 10 minutes ago (R27.5). The challenge they
   * make is the proof when the passkey comes back.
   */
  setupOptions(input: {
    readonly userId: string;
    readonly sessionId: string;
    readonly code?: string;
  }): Promise<Result<WebAuthnOptions, PasskeySetupError>>;
  /** Saves the passkey the device made, named from the browser's user agent. */
  add(input: {
    readonly userId: string;
    readonly credential: RegistrationResponseJSON;
    readonly userAgent: string;
  }): Promise<Result<MemberPasskey, PasskeyInvalid | TooMany>>;
  /** False when the account has no such passkey. */
  remove(userId: string, passkeyId: string): Promise<boolean>;
  /** The account's devices, oldest first. */
  list(userId: string): Promise<MemberPasskey[]>;
}

export interface MemberPasskeyServiceDependencies {
  readonly db: Database;
  readonly clock: () => Date;
  readonly logger: Logger;
  readonly auth: Pick<AuthService, "withConfirmCode">;
  readonly email?: EmailChannel;
  /** The website's origin, which every member's passkey is bound to. */
  readonly passkeyOrigin: string;
  /** Makes each account's user handle (ADR 0048). */
  readonly hasher: KeyedHasher;
}

const passkeyInvalid = { code: "passkey_invalid" } as const;
const passkeyUnknown = { code: "passkey_unknown" } as const;
const passkeyExpired = { code: "passkey_expired" } as const;
/** Setups of one account waiting for the browser's answer, at most. */
const waitingSetups = 5;
const tooMany = { code: "too_many" } as const;
const algorithms = [-7, -257];

/** The challenge a browser signed, read from its client data, or null. */
function challengeOf(clientDataJSON: string): string | null {
  try {
    const data: unknown = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString("utf8"));
    if (typeof data !== "object" || data === null || !("challenge" in data)) return null;
    return typeof data.challenge === "string" ? data.challenge : null;
  } catch {
    return null;
  }
}

function toMemberPasskey(row: typeof memberPasskeys.$inferSelect): MemberPasskey {
  return {
    id: row.id,
    credentialId: row.credentialId,
    browser: row.browser,
    system: row.system,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

export function createMemberPasskeyService(
  dependencies: MemberPasskeyServiceDependencies,
): MemberPasskeyService {
  const { db, clock, logger, auth, email, passkeyOrigin, hasher } = dependencies;
  const rpID = new URL(passkeyOrigin).hostname;
  const timeout = memberPasskeyRules.challengeSeconds * 1000;
  const expiry = () => new Date(clock().getTime() + timeout);

  /** Takes a challenge once: it is deleted whether or not the answer checks out. */
  async function takeChallenge(
    tx: Transaction,
    clientDataJSON: string,
    purpose: "sign_in" | "register",
  ) {
    const challenge = challengeOf(clientDataJSON);
    if (challenge === null) return null;
    const [row] = await tx
      .delete(memberPasskeyChallenges)
      .where(
        and(
          eq(memberPasskeyChallenges.challenge, challenge),
          eq(memberPasskeyChallenges.purpose, purpose),
          gt(memberPasskeyChallenges.expiresAt, clock()),
        ),
      )
      .returning();
    return row ?? null;
  }

  /** How many devices the account has. */
  async function devicesOf(executor: Transaction | Database, userId: string) {
    const [row] = await executor
      .select({ value: count() })
      .from(memberPasskeys)
      .where(eq(memberPasskeys.userId, userId));
    return row?.value ?? 0;
  }

  /**
   * The handle the account's passkeys share: a keyed hash of the account,
   * never its ID. It stays the same when the last device is removed and set
   * up again, so the device replaces its passkey rather than keeping two.
   */
  const userHandleOf = (userId: string) =>
    Buffer.from(hasher("member-passkey-user", userId), "hex").toString("base64url");

  async function registrationOptions(
    userId: string,
  ): Promise<{ readonly options: WebAuthnOptions; readonly userHandle: string }> {
    const [user] = await db
      .select({ firstName: users.firstName, email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    const existing = await db
      .select({ id: memberPasskeys.credentialId, transports: memberPasskeys.transports })
      .from(memberPasskeys)
      .where(eq(memberPasskeys.userId, userId));
    const name = user?.firstName ?? "PuffinRide";
    const userHandle = userHandleOf(userId);
    const options = await generateRegistrationOptions({
      rpName: "PuffinRide",
      rpID,
      // The device shows it in its list of passkeys: the email, which signs in too.
      userName: user?.email ?? name,
      userDisplayName: name,
      userID: Buffer.from(userHandle, "base64url"),
      timeout,
      attestationType: "none",
      excludeCredentials: existing.map((passkey) => ({
        id: passkey.id,
        transports: passkey.transports,
      })),
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      supportedAlgorithmIDs: algorithms,
    });
    return { options, userHandle };
  }

  async function verifyNewPasskey(credential: RegistrationResponseJSON, challenge: string) {
    try {
      const result = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challenge,
        expectedOrigin: passkeyOrigin,
        expectedRPID: rpID,
        requireUserVerification: true,
        supportedAlgorithmIDs: algorithms,
      });
      return result.verified ? result.registrationInfo : null;
    } catch {
      return null;
    }
  }

  return {
    async signInOptions() {
      const options = await generateAuthenticationOptions({
        rpID,
        timeout,
        userVerification: "required",
      });
      await db.insert(memberPasskeyChallenges).values({
        challenge: options.challenge,
        purpose: "sign_in",
        expiresAt: expiry(),
      });
      return options;
    },

    async signIn({ credential, device }) {
      return db.transaction(async (tx): Promise<Result<PasskeySignedIn, PasskeySignInError>> => {
        if (challengeOf(credential.response.clientDataJSON) === null) return err(passkeyInvalid);
        const challenge = await takeChallenge(tx, credential.response.clientDataJSON, "sign_in");
        if (challenge === null) return err(passkeyExpired);
        const [found] = await tx
          .select({ passkey: memberPasskeys, status: users.status })
          .from(memberPasskeys)
          .innerJoin(users, eq(users.id, memberPasskeys.userId))
          .where(eq(memberPasskeys.credentialId, credential.id))
          .for("update", { of: memberPasskeys });
        if (found === undefined) {
          // The console's shares the site, and the browser is never told to
          // forget it (R28.4); one in neither table was removed.
          const [console] = await tx
            .select({ id: operatorPasskeys.id })
            .from(operatorPasskeys)
            .where(eq(operatorPasskeys.credentialId, credential.id));
          return err(console === undefined ? passkeyUnknown : passkeyInvalid);
        }
        const { passkey } = found;
        const handle = credential.response.userHandle;
        if (handle !== undefined && handle !== passkey.userHandle) return err(passkeyInvalid);
        let newCounter: number;
        try {
          const result = await verifyAuthenticationResponse({
            response: credential,
            expectedChallenge: challenge.challenge,
            expectedOrigin: passkeyOrigin,
            expectedRPID: rpID,
            requireUserVerification: true,
            credential: {
              id: passkey.credentialId,
              publicKey: Buffer.from(passkey.publicKey, "base64url"),
              counter: passkey.counter,
              transports: passkey.transports,
            },
          });
          if (!result.verified) return err(passkeyInvalid);
          newCounter = result.authenticationInfo.newCounter;
        } catch {
          return err(passkeyInvalid);
        }
        // Only now, with a good answer: whether the account may sign in.
        if (!canSignIn(found.status)) return err({ code: "account_unavailable" });
        const now = clock();
        await tx
          .update(memberPasskeys)
          .set({ counter: newCounter, lastUsedAt: now, updatedAt: now })
          .where(eq(memberPasskeys.id, passkey.id));
        const { userId } = passkey;
        const { sessionId, tokens } = await openSession(tx, { userId, device, now });
        logger.info({ userId, sessionId, isNewUser: false, via: "passkey" }, "signed in");
        return ok({ userId, sessionId, tokens });
      });
    },

    async setupOptions({ userId, sessionId, code }) {
      if ((await devicesOf(db, userId)) >= memberPasskeyRules.perAccount) return err(tooMany);
      const [session] = await db
        .select({ startedAt: sessions.createdAt })
        .from(sessions)
        .where(eq(sessions.id, sessionId));
      if (session === undefined) throw new Error("The session does not exist.");
      const proofNeeded = needsProof(session.startedAt, clock());
      if (proofNeeded && code === undefined) return err({ code: "confirm_required" });
      const { options, userHandle } = await registrationOptions(userId);
      const save = async (tx: Transaction): Promise<Result<WebAuthnOptions, never>> => {
        // The account's older setups beyond a few go, so it cannot fill the table.
        const newest = tx
          .select({ challenge: memberPasskeyChallenges.challenge })
          .from(memberPasskeyChallenges)
          .where(
            and(
              eq(memberPasskeyChallenges.userId, userId),
              eq(memberPasskeyChallenges.purpose, "register"),
            ),
          )
          .orderBy(desc(memberPasskeyChallenges.expiresAt))
          .limit(waitingSetups - 1);
        await tx
          .delete(memberPasskeyChallenges)
          .where(
            and(
              eq(memberPasskeyChallenges.userId, userId),
              eq(memberPasskeyChallenges.purpose, "register"),
              notInArray(memberPasskeyChallenges.challenge, newest),
            ),
          );
        await tx.insert(memberPasskeyChallenges).values({
          challenge: options.challenge,
          purpose: "register",
          userId,
          userHandle,
          expiresAt: expiry(),
        });
        return ok(options);
      };
      return proofNeeded && code !== undefined
        ? auth.withConfirmCode(userId, code, save)
        : db.transaction(save);
    },

    async add({ userId, credential, userAgent }) {
      const added = await db.transaction(
        async (tx): Promise<Result<MemberPasskey, PasskeyInvalid | TooMany>> => {
          const challenge = await takeChallenge(tx, credential.response.clientDataJSON, "register");
          if (challenge?.userId !== userId || challenge.userHandle === null) {
            return err(passkeyInvalid);
          }
          const info = await verifyNewPasskey(credential, challenge.challenge);
          if (info === null) return err(passkeyInvalid);
          // The account's row, locked: two devices saved at once count each other.
          await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
          if ((await devicesOf(tx, userId)) >= memberPasskeyRules.perAccount) {
            return err(tooMany);
          }
          const device = deviceName(userAgent);
          const now = clock();
          const [row] = await tx
            .insert(memberPasskeys)
            .values({
              userId,
              credentialId: info.credential.id,
              publicKey: Buffer.from(info.credential.publicKey).toString("base64url"),
              counter: info.credential.counter,
              transports: info.credential.transports ?? [],
              backedUp: info.credentialBackedUp,
              userHandle: challenge.userHandle,
              browser: device?.browser ?? null,
              system: device?.system ?? null,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing()
            .returning();
          if (row === undefined) return err(passkeyInvalid);
          return ok(toMemberPasskey(row));
        },
      );
      if (!added.ok) return added;
      logger.info({ userId, passkeyId: added.value.id }, "passkey added");
      const { browser, system } = added.value;
      await tellVerifiedEmail({ db, email, logger }, userId, {
        kind: "passkey_added",
        device: browser === null || system === null ? null : { browser, system },
      });
      return added;
    },

    async remove(userId, passkeyId) {
      const removed = await db
        .delete(memberPasskeys)
        .where(and(eq(memberPasskeys.id, passkeyId), eq(memberPasskeys.userId, userId)))
        .returning({ id: memberPasskeys.id });
      if (removed.length === 0) return false;
      logger.info({ userId, passkeyId }, "passkey removed");
      return true;
    },

    async list(userId) {
      const rows = await db
        .select()
        .from(memberPasskeys)
        .where(eq(memberPasskeys.userId, userId))
        .orderBy(asc(memberPasskeys.createdAt), asc(memberPasskeys.id));
      return rows.map(toMemberPasskey);
    },
  };
}
