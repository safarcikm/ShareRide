import type { Passkey } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  canRemovePasskey,
  canUseConsole,
  checkSetupLink,
  err,
  isRecentlyConfirmed,
  ok,
  passkeyRules,
  type Result,
} from "@shareride/domain";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { and, asc, count, eq, gt, isNull } from "drizzle-orm";
import { hashToken, newToken } from "../../platform/crypto.ts";
import { recordAudit, type AuditRequest } from "./audit.ts";
import type { OperatorSessionService, StartedOperatorSession } from "./sessions.ts";

const { operatorChallenges, operatorPasskeys, operatorSessions, operatorSetupLinks, users } =
  schema;

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** What the browser's `navigator.credentials` call takes, made by the server. */
export type WebAuthnOptions =
  PublicKeyCredentialCreationOptionsJSON | PublicKeyCredentialRequestOptionsJSON;

export type SetupError = { readonly code: "setup_link_invalid" } | PasskeyInvalid;
export interface PasskeyInvalid {
  readonly code: "passkey_invalid";
}
export type SignInError = PasskeyInvalid | { readonly code: "operator_unavailable" };
/** Passkeys change only shortly after a passkey was used (ADR 0028). */
export interface ConfirmationRequired {
  readonly code: "confirmation_required";
}
export type RemoveError =
  { readonly code: "not_found" } | { readonly code: "last_passkey" } | ConfirmationRequired;

export interface SignedInOperator {
  readonly userId: string;
  readonly session: StartedOperatorSession;
}

export interface PasskeyService {
  /**
   * A setup link for the `operator` command or a recovery code (spec 22);
   * replaces the account's earlier ones. With `tx`, it is made in that
   * transaction.
   */
  createSetupLink(userId: string, tx?: Transaction): Promise<{ token: string; expiresAt: Date }>;
  setupOptions(token: string): Promise<Result<WebAuthnOptions, SetupError>>;
  /** Saves the first passkey from a setup link and signs the operator in. */
  setup(input: {
    token: string;
    credential: RegistrationResponseJSON;
    name: string;
    request: AuditRequest;
  }): Promise<Result<SignedInOperator, SetupError>>;
  signInOptions(): Promise<WebAuthnOptions>;
  signIn(input: {
    credential: AuthenticationResponseJSON;
    request: AuditRequest;
  }): Promise<Result<SignedInOperator, SignInError>>;
  list(userId: string): Promise<Passkey[]>;
  /** Asks for one of the operator's own passkeys, to confirm it is them. */
  confirmOptions(userId: string): Promise<WebAuthnOptions>;
  /** Marks the session confirmed, so passkeys can change for a few minutes. */
  confirm(input: {
    operator: { userId: string; sessionId: string };
    credential: AuthenticationResponseJSON;
    request: AuditRequest;
  }): Promise<Result<{ confirmedUntil: Date }, PasskeyInvalid>>;
  /**
   * Options for a new passkey, only shortly after a passkey was used: the
   * challenge it makes is the proof when the new passkey comes back.
   */
  addOptions(operator: {
    userId: string;
    sessionId: string;
  }): Promise<Result<WebAuthnOptions, ConfirmationRequired>>;
  add(input: {
    operator: { userId: string; sessionId: string };
    credential: RegistrationResponseJSON;
    name: string;
    request: AuditRequest;
  }): Promise<Result<Passkey, PasskeyInvalid>>;
  remove(input: {
    operator: { userId: string; sessionId: string };
    passkeyId: string;
    request: AuditRequest;
  }): Promise<Result<undefined, RemoveError>>;
}

export interface PasskeyServiceDependencies {
  readonly db: Database;
  readonly clock: () => Date;
  readonly sessions: OperatorSessionService;
  /** The console's origin, which every passkey is bound to. */
  readonly adminOrigin: string;
}

const passkeyInvalid = { code: "passkey_invalid" } as const;
const confirmationRequired = { code: "confirmation_required" } as const;

/** Rolls a setup back when its passkey was saved already, keeping the link. */
class PasskeyTaken extends Error {}
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

function toPasskey(row: typeof operatorPasskeys.$inferSelect): Passkey {
  return {
    id: row.id,
    name: row.name,
    backedUp: row.backedUp,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

export function createPasskeyService(dependencies: PasskeyServiceDependencies): PasskeyService {
  const { db, clock, sessions, adminOrigin } = dependencies;
  const rpID = new URL(adminOrigin).hostname;
  const timeout = passkeyRules.challengeSeconds * 1000;

  const expiry = () => new Date(clock().getTime() + timeout);

  /** Takes a challenge once: it is deleted whether or not the answer checks out. */
  async function takeChallenge(
    tx: Transaction,
    clientDataJSON: string,
    purpose: "setup" | "add" | "sign_in" | "confirm",
  ) {
    const challenge = challengeOf(clientDataJSON);
    if (challenge === null) return null;
    const [row] = await tx
      .delete(operatorChallenges)
      .where(
        and(
          eq(operatorChallenges.challenge, challenge),
          eq(operatorChallenges.purpose, purpose),
          gt(operatorChallenges.expiresAt, clock()),
        ),
      )
      .returning();
    return row ?? null;
  }

  async function findSetupLink(tx: Transaction | Database, token: string) {
    const [link] = await tx
      .select()
      .from(operatorSetupLinks)
      .innerJoin(users, eq(users.id, operatorSetupLinks.userId))
      .where(eq(operatorSetupLinks.tokenHash, hashToken(token)));
    if (link === undefined) return null;
    if (checkSetupLink(link.operator_setup_links, clock()) !== "valid") return null;
    if (!canUseConsole(link.users)) return null;
    return link;
  }

  async function registrationOptions(
    userId: string,
    firstName: string | null,
  ): Promise<WebAuthnOptions> {
    const existing = await db
      .select({ id: operatorPasskeys.credentialId, transports: operatorPasskeys.transports })
      .from(operatorPasskeys)
      .where(eq(operatorPasskeys.userId, userId));
    const name = firstName ?? "Operator";
    return generateRegistrationOptions({
      rpName: "PuffinRide console",
      rpID,
      userName: name,
      userDisplayName: name,
      userID: Buffer.from(userId.replaceAll("-", ""), "hex"),
      timeout,
      attestationType: "none",
      excludeCredentials: existing,
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      supportedAlgorithmIDs: algorithms,
    });
  }

  async function verifyNewPasskey(credential: RegistrationResponseJSON, challenge: string) {
    try {
      const result = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challenge,
        expectedOrigin: adminOrigin,
        expectedRPID: rpID,
        requireUserVerification: true,
        supportedAlgorithmIDs: algorithms,
      });
      return result.verified ? result.registrationInfo : null;
    } catch {
      return null;
    }
  }

  /**
   * Whether the account may use the console, read under a share lock: the
   * `operator` command's removal waits for this transaction, or this one
   * waits for it and sees the role gone.
   */
  async function mayUseConsole(tx: Transaction, userId: string): Promise<boolean> {
    const [account] = await tx
      .select({ roles: users.roles, status: users.status, deleteAfter: users.deleteAfter })
      .from(users)
      .where(eq(users.id, userId))
      .for("share");
    return account !== undefined && canUseConsole(account);
  }

  /** Whether the session used a passkey, or the password (ADR 0041), in the last few minutes. */
  async function isConfirmed(tx: Transaction | Database, sessionId: string): Promise<boolean> {
    const [session] = await tx
      .select({ confirmedAt: operatorSessions.confirmedAt })
      .from(operatorSessions)
      .where(eq(operatorSessions.id, sessionId));
    return session !== undefined && isRecentlyConfirmed(session.confirmedAt, clock());
  }

  /**
   * Checks a passkey's answer to a challenge and moves its counter on. Null
   * when it does not check out, or, with `ownerId`, is someone else's.
   */
  async function checkAnswer(
    tx: Transaction,
    credential: AuthenticationResponseJSON,
    challenge: string,
    ownerId?: string,
  ) {
    const byId = eq(operatorPasskeys.credentialId, credential.id);
    const [passkey] = await tx
      .select()
      .from(operatorPasskeys)
      .where(ownerId === undefined ? byId : and(byId, eq(operatorPasskeys.userId, ownerId)))
      .for("update");
    if (passkey === undefined) return null;
    let newCounter: number;
    try {
      const result = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: challenge,
        expectedOrigin: adminOrigin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: passkey.credentialId,
          publicKey: Buffer.from(passkey.publicKey, "base64url"),
          counter: passkey.counter,
          transports: passkey.transports,
        },
      });
      if (!result.verified) return null;
      newCounter = result.authenticationInfo.newCounter;
    } catch {
      return null;
    }
    await tx
      .update(operatorPasskeys)
      .set({ counter: newCounter, lastUsedAt: clock() })
      .where(eq(operatorPasskeys.id, passkey.id));
    return passkey;
  }

  async function savePasskey(
    tx: Transaction,
    userId: string,
    name: string,
    info: NonNullable<Awaited<ReturnType<typeof verifyNewPasskey>>>,
  ) {
    const [row] = await tx
      .insert(operatorPasskeys)
      .values({
        userId,
        credentialId: info.credential.id,
        publicKey: Buffer.from(info.credential.publicKey).toString("base64url"),
        counter: info.credential.counter,
        transports: info.credential.transports ?? [],
        backedUp: info.credentialBackedUp,
        name,
      })
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  async function setUpPasskey({
    token,
    credential,
    name,
    request,
  }: {
    token: string;
    credential: RegistrationResponseJSON;
    name: string;
    request: AuditRequest;
  }): Promise<Result<SignedInOperator, SetupError>> {
    return db.transaction(async (tx) => {
      const link = await findSetupLink(tx, token);
      if (link === null || !(await mayUseConsole(tx, link.users.id))) {
        return err({ code: "setup_link_invalid" } as const);
      }
      const challenge = await takeChallenge(tx, credential.response.clientDataJSON, "setup");
      if (challenge?.setupLinkId !== link.operator_setup_links.id) return err(passkeyInvalid);
      const info = await verifyNewPasskey(credential, challenge.challenge);
      if (info === null) return err(passkeyInvalid);
      // Claims the link before anything is saved: of two answers sent at
      // once, only the first finds it unused.
      const [claimed] = await tx
        .update(operatorSetupLinks)
        .set({ usedAt: clock() })
        .where(
          and(
            eq(operatorSetupLinks.id, link.operator_setup_links.id),
            isNull(operatorSetupLinks.usedAt),
            gt(operatorSetupLinks.expiresAt, clock()),
          ),
        )
        .returning({ id: operatorSetupLinks.id });
      if (claimed === undefined) return err({ code: "setup_link_invalid" } as const);
      const userId = link.users.id;
      const passkey = await savePasskey(tx, userId, name, info);
      // Rolls back, so the setup link stays usable for another try.
      if (passkey === null) throw new PasskeyTaken();
      const session = await sessions.start({ userId, device: request.userAgent }, tx);
      const operator = { userId, sessionId: session.sessionId };
      await recordAudit(tx, {
        operator,
        action: "operator.passkey.added",
        subjectType: "operator_passkey",
        subjectId: passkey.id,
        after: { name, setupLink: link.operator_setup_links.id },
        request,
      });
      await recordAudit(tx, {
        operator,
        action: "operator.signed_in",
        subjectType: "operator_session",
        subjectId: session.sessionId,
        request,
      });
      return ok({ userId, session });
    });
  }

  return {
    async createSetupLink(userId, tx) {
      const token = newToken("operatorSetup");
      const expiresAt = new Date(clock().getTime() + passkeyRules.setupLinkMinutes * 60_000);
      const replace = async (executor: Transaction) => {
        await executor.delete(operatorSetupLinks).where(eq(operatorSetupLinks.userId, userId));
        await executor
          .insert(operatorSetupLinks)
          .values({ userId, tokenHash: hashToken(token), expiresAt });
      };
      await (tx === undefined ? db.transaction(replace) : replace(tx));
      return { token, expiresAt };
    },

    async setupOptions(token) {
      const link = await findSetupLink(db, token);
      if (link === null) return err({ code: "setup_link_invalid" });
      const options = await registrationOptions(link.users.id, link.users.firstName);
      await db.insert(operatorChallenges).values({
        challenge: options.challenge,
        purpose: "setup",
        userId: link.users.id,
        setupLinkId: link.operator_setup_links.id,
        expiresAt: expiry(),
      });
      return ok(options);
    },

    async setup(input) {
      try {
        return await setUpPasskey(input);
      } catch (error) {
        if (error instanceof PasskeyTaken) return err(passkeyInvalid);
        throw error;
      }
    },

    async signInOptions() {
      const options = await generateAuthenticationOptions({
        rpID,
        timeout,
        userVerification: "required",
      });
      await db.insert(operatorChallenges).values({
        challenge: options.challenge,
        purpose: "sign_in",
        expiresAt: expiry(),
      });
      return options;
    },
    async signIn({ credential, request }) {
      return db.transaction(async (tx) => {
        const challenge = await takeChallenge(tx, credential.response.clientDataJSON, "sign_in");
        if (challenge === null) return err(passkeyInvalid);
        const passkey = await checkAnswer(tx, credential, challenge.challenge);
        if (passkey === null) return err(passkeyInvalid);
        const { userId } = passkey;
        if (!(await mayUseConsole(tx, userId))) {
          return err({ code: "operator_unavailable" } as const);
        }
        const session = await sessions.start({ userId, device: request.userAgent }, tx);
        await recordAudit(tx, {
          operator: { userId, sessionId: session.sessionId },
          action: "operator.signed_in",
          subjectType: "operator_session",
          subjectId: session.sessionId,
          after: { passkey: passkey.id },
          request,
        });
        return ok({ userId, session });
      });
    },

    async confirmOptions(userId) {
      const mine = await db
        .select({ id: operatorPasskeys.credentialId, transports: operatorPasskeys.transports })
        .from(operatorPasskeys)
        .where(eq(operatorPasskeys.userId, userId));
      const options = await generateAuthenticationOptions({
        rpID,
        timeout,
        userVerification: "required",
        allowCredentials: mine,
      });
      await db.insert(operatorChallenges).values({
        challenge: options.challenge,
        purpose: "confirm",
        userId,
        expiresAt: expiry(),
      });
      return options;
    },

    async confirm({ operator, credential, request }) {
      return db.transaction(async (tx) => {
        const challenge = await takeChallenge(tx, credential.response.clientDataJSON, "confirm");
        if (challenge?.userId !== operator.userId) return err(passkeyInvalid);
        const passkey = await checkAnswer(tx, credential, challenge.challenge, operator.userId);
        if (passkey === null) return err(passkeyInvalid);
        const now = clock();
        await tx
          .update(operatorSessions)
          .set({ confirmedAt: now })
          .where(eq(operatorSessions.id, operator.sessionId));
        await recordAudit(tx, {
          operator,
          action: "operator.confirmed",
          subjectType: "operator_session",
          subjectId: operator.sessionId,
          after: { passkey: passkey.id },
          request,
        });
        return ok({
          confirmedUntil: new Date(now.getTime() + passkeyRules.confirmedMinutes * 60_000),
        });
      });
    },

    async list(userId) {
      const rows = await db
        .select()
        .from(operatorPasskeys)
        .where(eq(operatorPasskeys.userId, userId))
        .orderBy(asc(operatorPasskeys.createdAt), asc(operatorPasskeys.id));
      return rows.map(toPasskey);
    },

    async addOptions({ userId, sessionId }) {
      if (!(await isConfirmed(db, sessionId))) return err(confirmationRequired);
      const [user] = await db
        .select({ firstName: users.firstName })
        .from(users)
        .where(eq(users.id, userId));
      const options = await registrationOptions(userId, user?.firstName ?? null);
      await db.insert(operatorChallenges).values({
        challenge: options.challenge,
        purpose: "add",
        userId,
        expiresAt: expiry(),
      });
      return ok(options);
    },

    async add({ operator, credential, name, request }) {
      return db.transaction(async (tx) => {
        if (!(await mayUseConsole(tx, operator.userId))) return err(passkeyInvalid);
        const challenge = await takeChallenge(tx, credential.response.clientDataJSON, "add");
        if (challenge?.userId !== operator.userId) return err(passkeyInvalid);
        const info = await verifyNewPasskey(credential, challenge.challenge);
        if (info === null) return err(passkeyInvalid);
        const passkey = await savePasskey(tx, operator.userId, name, info);
        if (passkey === null) return err(passkeyInvalid);
        await recordAudit(tx, {
          operator,
          action: "operator.passkey.added",
          subjectType: "operator_passkey",
          subjectId: passkey.id,
          after: { name },
          request,
        });
        return ok(toPasskey(passkey));
      });
    },

    async remove({ operator, passkeyId, request }) {
      return db.transaction(async (tx) => {
        if (!(await isConfirmed(tx, operator.sessionId))) return err(confirmationRequired);
        // Locks the operator's passkeys, so two removals cannot both pass the count.
        const mine = await tx
          .select({ id: operatorPasskeys.id, name: operatorPasskeys.name })
          .from(operatorPasskeys)
          .where(eq(operatorPasskeys.userId, operator.userId))
          .for("update");
        const passkey = mine.find((candidate) => candidate.id === passkeyId);
        if (passkey === undefined) return err({ code: "not_found" } as const);
        if (!canRemovePasskey(mine.length)) return err({ code: "last_passkey" } as const);
        await tx.delete(operatorPasskeys).where(eq(operatorPasskeys.id, passkeyId));
        await recordAudit(tx, {
          operator,
          action: "operator.passkey.removed",
          subjectType: "operator_passkey",
          subjectId: passkeyId,
          before: { name: passkey.name },
          request,
        });
        return ok(undefined);
      });
    },
  };
}

/** How many passkeys an account has, for the `operator` command. */
export async function passkeyCount(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(operatorPasskeys)
    .where(eq(operatorPasskeys.userId, userId));
  return row?.value ?? 0;
}
