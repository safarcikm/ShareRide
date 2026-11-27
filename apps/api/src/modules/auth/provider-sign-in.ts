import { timingSafeEqual } from "node:crypto";
import { schema, type Database } from "@shareride/db";
import {
  decideLink,
  err,
  isAllowedReturnUrl,
  isChallengeShaped,
  ok,
  providerSignInRules,
  signInProviders,
  type Result,
  type ReturnUrlsAllowed,
  type SignInProvider,
} from "@shareride/domain";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import type { Logger } from "../../logger.ts";
import { hashToken, newToken, type KeyedHasher } from "../../platform/crypto.ts";
import { uniqueViolation } from "../../platform/database-errors.ts";
import { pkceChallenge, type IdentityProvider } from "../../platform/identity-providers.ts";
import type { RateLimiter } from "../../platform/memory-rate-limiter.ts";
import {
  applyLink,
  linkStateOf,
  lockPendingSignIn,
  providerTakenConstraint,
  subjectTakenConstraint,
} from "./identities.ts";
import { openSession } from "./sessions.ts";
import {
  canSignIn,
  type AuthService,
  type ConfirmError,
  type Device,
  type SignedIn,
  type Transaction,
} from "./service.ts";

// Signing in with Google and Apple through our API (ADR 0034; plan 4.1):
// the start, the provider's answer, the app's ticket, and the sign-in
// methods, a page of Profile.

const { identities, providerSignIns, users } = schema;

/** Where the browser goes next, or which page to show when it cannot go back. */
export type BrowserStep =
  | { readonly kind: "redirect"; readonly location: string }
  | {
      readonly kind: "page";
      readonly status: 400 | 404;
      /** `off`: no such provider; `invalid`: a bad start; `expired`: an unknown or used state. */
      readonly page: "off" | "invalid" | "expired";
    };

export type FinishOutcome =
  | ({ readonly status: "signedIn" } & SignedIn)
  | {
      readonly status: "phoneNeeded";
      readonly pendingSignIn: string;
      readonly provider: SignInProvider;
      readonly email: string | null;
      readonly firstName: string | null;
      readonly expiresAt: Date;
    };

export interface LinkedMethod {
  readonly provider: SignInProvider;
  readonly email: string | null;
  readonly linkedAt: Date;
}

type TicketError = { readonly code: "ticket_invalid" };
type LinkRefusal =
  { readonly code: "provider_in_use" } | { readonly code: "provider_already_linked" };

export interface ProviderSignInService {
  /** The providers that are on, in the order the sign-in screen shows them. */
  readonly names: readonly SignInProvider[];
  /** Whether this provider is the development stand-in, whose page the API serves. */
  isDevelopment(provider: SignInProvider): boolean;
  /** The provider's way back to the API. */
  callbackUrl(provider: SignInProvider): string;
  start(input: {
    readonly provider: SignInProvider;
    readonly challenge: string | undefined;
    readonly returnUrl: string | undefined;
    /** The caller's address as a keyed hash, for the start limit. */
    readonly clientKey: string;
  }): Promise<BrowserStep>;
  callback(input: {
    readonly provider: SignInProvider;
    readonly state: string | undefined;
    readonly code: string | undefined;
    readonly error: string | undefined;
    readonly appleUser?: unknown;
  }): Promise<BrowserStep>;
  finish(input: {
    readonly ticket: string;
    readonly verifier: string;
    readonly device: Device;
  }): Promise<Result<FinishOutcome, TicketError | { readonly code: "account_unavailable" }>>;
  /** Settings: takes the ticket for the signed-in account, before the confirm code is asked for. */
  prepareLink(input: {
    readonly userId: string;
    readonly ticket: string;
    readonly verifier: string;
  }): Promise<
    Result<
      {
        readonly pendingSignIn: string;
        readonly provider: SignInProvider;
        readonly email: string | null;
        readonly expiresAt: Date;
      },
      TicketError | LinkRefusal
    >
  >;
  /** Settings: adds the prepared provider account with a confirm code (R19.3). */
  link(input: {
    readonly userId: string;
    readonly pendingSignIn: string;
    readonly code: string;
  }): Promise<
    Result<LinkedMethod, ConfirmError | LinkRefusal | { readonly code: "provider_expired" }>
  >;
  list(userId: string): Promise<LinkedMethod[]>;
  /** False when none of this provider is linked. */
  remove(userId: string, provider: SignInProvider): Promise<boolean>;
}

export interface ProviderSignInDependencies {
  readonly db: Database;
  readonly hasher: KeyedHasher;
  readonly clock: () => Date;
  readonly logger: Logger;
  readonly auth: AuthService;
  readonly providers: readonly IdentityProvider[];
  /** Where browsers reach the API, for the callback addresses. */
  readonly apiOrigin: string;
  readonly returnUrls: ReturnUrlsAllowed;
  /** The start limit per address (plan 4.5). */
  readonly limiter: RateLimiter;
}

const addSeconds = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000);

/** The longest return address taken; ours are far shorter. */
const maxReturnUrlLength = 300;

/** What Google and Apple send when the person pressed Cancel (plan, section 1, item 2). */
const cancelErrors: readonly string[] = ["access_denied", "user_cancelled_authorize"];

/**
 * The errors of OAuth 2.0 (RFC 6749, 4.1.2.1) and OpenID Connect (Core
 * 3.1.2.6) that are logged by name; any other text is logged as "other".
 */
const knownProviderErrors: readonly string[] = [
  "no_code",
  "invalid_request",
  "unauthorized_client",
  "unsupported_response_type",
  "invalid_scope",
  "server_error",
  "temporarily_unavailable",
  "interaction_required",
  "login_required",
  "account_selection_required",
  "consent_required",
  "invalid_request_uri",
  "invalid_request_object",
  "request_not_supported",
  "request_uri_not_supported",
  "registration_not_supported",
];

function sameChallenge(verifier: string, challenge: string): boolean {
  const left = Buffer.from(pkceChallenge(verifier));
  const right = Buffer.from(challenge);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createProviderSignInService(
  dependencies: ProviderSignInDependencies,
): ProviderSignInService {
  const { db, hasher, clock, logger, auth, apiOrigin, returnUrls, limiter } = dependencies;
  const providers = new Map(dependencies.providers.map((provider) => [provider.name, provider]));
  const names = signInProviders.filter((name) => providers.has(name));
  const callbackUrl = (provider: SignInProvider) =>
    `${apiOrigin}/v1/auth/oauth/${provider}/callback`;
  // Only a request that has the state can make these, and they are never stored.
  const codeVerifierOf = (state: string) => hasher("oauth-pkce", state);
  const nonceOf = (state: string) => hasher("oauth-nonce", state);

  /** The answered sign-in a ticket belongs to, locked, if the ticket is good and the verifier is the app's. */
  async function lockTicket(tx: Transaction, ticket: string, verifier: string, now: Date) {
    const [row] = await tx
      .select({
        id: providerSignIns.id,
        provider: providerSignIns.provider,
        challenge: providerSignIns.challenge,
        subject: providerSignIns.subject,
        email: providerSignIns.email,
        firstName: providerSignIns.firstName,
        expiresAt: providerSignIns.expiresAt,
      })
      .from(providerSignIns)
      .where(
        and(
          eq(providerSignIns.ticketHash, hashToken(ticket)),
          isNull(providerSignIns.ticketUsedAt),
          gt(providerSignIns.ticketExpiresAt, now),
        ),
      )
      .for("update");
    if (row === undefined || row.subject === null) return null;
    // A ticket caught on its way back to the app is useless without the app's secret.
    if (!sameChallenge(verifier, row.challenge)) return null;
    return { ...row, provider: row.provider as SignInProvider, subject: row.subject };
  }

  /** Makes the waiting sign-in that the phone step or Settings takes next. */
  async function keepWaiting(
    tx: Transaction,
    id: string,
    linkUserId: string | null,
    now: Date,
  ): Promise<string> {
    const pendingSignIn = newToken("pendingSignIn");
    await tx
      .update(providerSignIns)
      .set({ ticketUsedAt: now, pendingHash: hashToken(pendingSignIn), linkUserId, updatedAt: now })
      .where(eq(providerSignIns.id, id));
    return pendingSignIn;
  }

  const back = (returnUrl: string, fragment: string): BrowserStep => ({
    kind: "redirect",
    location: `${returnUrl}#${fragment}`,
  });

  return {
    names,
    isDevelopment: (provider) => providers.get(provider)?.development === true,
    callbackUrl,

    async start(input) {
      const provider = providers.get(input.provider);
      if (provider === undefined) return { kind: "page", status: 404, page: "off" };
      const { challenge, returnUrl } = input;
      if (
        challenge === undefined ||
        !isChallengeShaped(challenge) ||
        returnUrl === undefined ||
        returnUrl.length > maxReturnUrlLength ||
        !isAllowedReturnUrl(returnUrl, returnUrls)
      ) {
        return { kind: "page", status: 400, page: "invalid" };
      }
      if (!limiter.hit(input.clientKey).ok) {
        logger.warn({ provider: input.provider }, "provider sign-in start limit reached");
        return back(returnUrl, "error=failed");
      }
      const now = clock();
      const state = newToken("providerState");
      await db.insert(providerSignIns).values({
        provider: input.provider,
        stateHash: hashToken(state),
        challenge,
        returnUrl,
        expiresAt: addSeconds(now, providerSignInRules.startValidSeconds),
        createdAt: now,
        updatedAt: now,
      });
      return {
        kind: "redirect",
        location: provider.authorizationUrl({
          state,
          nonce: nonceOf(state),
          codeVerifier: codeVerifierOf(state),
          redirectUri: callbackUrl(input.provider),
        }),
      };
    },

    async callback(input) {
      const provider = providers.get(input.provider);
      if (provider === undefined) return { kind: "page", status: 404, page: "off" };
      const { state } = input;
      if (state === undefined || state.length > 200) {
        return { kind: "page", status: 400, page: "expired" };
      }
      const now = clock();
      // Claims the sign-in at once, so a state works once, and nothing is
      // held locked while the provider is asked.
      const [claimed] = await db
        .update(providerSignIns)
        .set({ answeredAt: now, updatedAt: now })
        .where(
          and(
            eq(providerSignIns.stateHash, hashToken(state)),
            eq(providerSignIns.provider, input.provider),
            isNull(providerSignIns.answeredAt),
            gt(providerSignIns.expiresAt, now),
          ),
        )
        .returning({ id: providerSignIns.id, returnUrl: providerSignIns.returnUrl });
      if (claimed === undefined) {
        // Too late: back to the app, which says so, the first time only.
        const [late] = await db
          .delete(providerSignIns)
          .where(
            and(
              eq(providerSignIns.stateHash, hashToken(state)),
              eq(providerSignIns.provider, input.provider),
              isNull(providerSignIns.answeredAt),
              lte(providerSignIns.expiresAt, now),
            ),
          )
          .returning({ returnUrl: providerSignIns.returnUrl });
        return late === undefined
          ? { kind: "page", status: 400, page: "expired" }
          : back(late.returnUrl, "error=expired");
      }
      const forget = () => db.delete(providerSignIns).where(eq(providerSignIns.id, claimed.id));

      if (input.error !== undefined || input.code === undefined) {
        await forget();
        // The person pressed Cancel: back to the sign-in screen, without an error.
        if (cancelErrors.includes(input.error ?? ""))
          return back(claimed.returnUrl, "error=cancelled");
        // Anything else is logged, by a name from the OAuth lists only, and not passed on.
        const said = input.error ?? "no_code";
        logger.warn(
          {
            provider: input.provider,
            reason: "provider_error",
            providerError: knownProviderErrors.includes(said) ? said : "other",
          },
          "provider sign-in refused",
        );
        return back(claimed.returnUrl, "error=failed");
      }
      const claims = await provider.redeem({
        code: input.code,
        codeVerifier: codeVerifierOf(state),
        nonce: nonceOf(state),
        redirectUri: callbackUrl(input.provider),
        appleUser: input.appleUser,
      });
      if (!claims.ok) {
        await forget();
        logger.warn(
          { provider: input.provider, reason: claims.error.reason },
          "provider sign-in refused",
        );
        return back(claimed.returnUrl, "error=failed");
      }
      const answeredAt = clock();
      const ticket = newToken("providerTicket");
      await db
        .update(providerSignIns)
        .set({
          subject: claims.value.subject,
          email: claims.value.email,
          firstName: claims.value.firstName,
          ticketHash: hashToken(ticket),
          ticketExpiresAt: addSeconds(answeredAt, providerSignInRules.ticketValidSeconds),
          expiresAt: addSeconds(answeredAt, providerSignInRules.pendingValidSeconds),
          updatedAt: answeredAt,
        })
        .where(eq(providerSignIns.id, claimed.id));
      return back(claimed.returnUrl, `ticket=${ticket}`);
    },

    async finish(input) {
      const now = clock();
      return db.transaction(
        async (
          tx,
        ): Promise<Result<FinishOutcome, TicketError | { code: "account_unavailable" }>> => {
          const row = await lockTicket(tx, input.ticket, input.verifier, now);
          if (row === null) return err({ code: "ticket_invalid" });
          const [owner] = await tx
            .select({ identityId: identities.id, userId: users.id, status: users.status })
            .from(identities)
            .innerJoin(users, eq(users.id, identities.userId))
            .where(and(eq(identities.provider, row.provider), eq(identities.subject, row.subject)))
            .for("update", { of: [users] });

          if (owner === undefined) {
            // A newcomer gives a phone number next (spec 19, 3.3; R19.2).
            const pendingSignIn = await keepWaiting(tx, row.id, null, now);
            return ok({
              status: "phoneNeeded",
              pendingSignIn,
              provider: row.provider,
              email: row.email,
              firstName: row.firstName,
              expiresAt: row.expiresAt,
            });
          }

          await tx.delete(providerSignIns).where(eq(providerSignIns.id, row.id));
          // As a phone sign-in: a suspended person signs in, an account
          // waiting to be deleted too, to keep it (R19.6).
          if (!canSignIn(owner.status)) return err({ code: "account_unavailable" });
          await tx
            .update(identities)
            .set({ lastUsedAt: now, updatedAt: now })
            .where(eq(identities.id, owner.identityId));
          const { sessionId, tokens } = await openSession(tx, {
            userId: owner.userId,
            device: input.device,
            now,
          });
          logger.info(
            { userId: owner.userId, sessionId, provider: row.provider, isNewUser: false },
            "signed in",
          );
          return ok({
            status: "signedIn",
            userId: owner.userId,
            sessionId,
            platform: input.device.platform,
            isNewUser: false,
            tokens,
          });
        },
      );
    },

    async prepareLink(input) {
      const now = clock();
      return db.transaction(async (tx) => {
        const row = await lockTicket(tx, input.ticket, input.verifier, now);
        if (row === null) return err<TicketError | LinkRefusal>({ code: "ticket_invalid" });
        const decision = decideLink({
          via: "settings",
          accountId: input.userId,
          ...(await linkStateOf(tx, { ...row, accountId: input.userId })),
        });
        // Refused before any code is asked for, so a refusal never uses one up.
        if (decision.action === "refuse" || decision.action === "already_linked") {
          await tx.delete(providerSignIns).where(eq(providerSignIns.id, row.id));
          return err<TicketError | LinkRefusal>({
            code: decision.action === "refuse" ? decision.code : "provider_already_linked",
          });
        }
        const pendingSignIn = await keepWaiting(tx, row.id, input.userId, now);
        return ok({
          pendingSignIn,
          provider: row.provider,
          email: row.email,
          expiresAt: row.expiresAt,
        });
      });
    },

    async link(input) {
      const now = clock();
      try {
        const linked = await auth.withConfirmCode(input.userId, input.code, async (tx) => {
          const pending = await lockPendingSignIn(tx, input.pendingSignIn, now, input.userId);
          if (pending === null) {
            return err<{ readonly code: "provider_expired" } | LinkRefusal>({
              code: "provider_expired",
            });
          }
          // As the phone step does, so the two link one account in turn.
          await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, input.userId))
            .for("update");
          const decision = decideLink({
            via: "settings",
            accountId: input.userId,
            ...(await linkStateOf(tx, { ...pending, accountId: input.userId })),
          });
          if (decision.action === "refuse" || decision.action === "already_linked") {
            return err<{ readonly code: "provider_expired" } | LinkRefusal>({
              code: decision.action === "refuse" ? decision.code : "provider_already_linked",
            });
          }
          await applyLink(tx, { decision, pending, userId: input.userId, now });
          return ok<LinkedMethod>({
            provider: pending.provider,
            email: pending.email,
            linkedAt: now,
          });
        });
        if (linked.ok) {
          logger.info(
            { userId: input.userId, provider: linked.value.provider },
            "sign-in method added",
          );
        }
        return linked;
      } catch (error) {
        // A race with another link of the same account or provider account.
        if (uniqueViolation(error, subjectTakenConstraint)) return err({ code: "provider_in_use" });
        if (uniqueViolation(error, providerTakenConstraint)) {
          return err({ code: "provider_already_linked" });
        }
        throw error;
      }
    },

    async list(userId) {
      const rows = await db
        .select({
          provider: identities.provider,
          email: identities.email,
          linkedAt: identities.linkedAt,
        })
        .from(identities)
        .where(eq(identities.userId, userId));
      return rows
        .map((row) => ({ ...row, provider: row.provider as SignInProvider }))
        .sort((a, b) => signInProviders.indexOf(a.provider) - signInProviders.indexOf(b.provider));
    },

    async remove(userId, provider) {
      const removed = await db
        .delete(identities)
        .where(and(eq(identities.userId, userId), eq(identities.provider, provider)))
        .returning({ id: identities.id });
      if (removed.length > 0) logger.info({ userId, provider }, "sign-in method removed");
      return removed.length > 0;
    },
  };
}
