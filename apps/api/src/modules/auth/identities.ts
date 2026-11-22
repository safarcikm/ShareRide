import { schema } from "@shareride/db";
import { emailToStore, type LinkDecision, type SignInProvider } from "@shareride/domain";
import { and, eq, gt, isNotNull, isNull, ne } from "drizzle-orm";
import { hashToken } from "../../platform/crypto.ts";
import { uniqueViolation } from "../../platform/database-errors.ts";
import type { Transaction } from "./service.ts";

// Google and Apple accounts linked to ShareRide accounts (spec 19, R19.1 to
// R19.4): the steps the phone step and Settings share, inside their
// transactions.

const { identities, providerSignIns, users } = schema;

/** A Google or Apple sign-in the provider answered, waiting for the phone step or Settings. */
export interface PendingSignIn {
  readonly id: string;
  readonly provider: SignInProvider;
  readonly subject: string;
  readonly email: string | null;
  readonly firstName: string | null;
  readonly expiresAt: Date;
}

/**
 * Locks a waiting sign-in by its token: answered, less than 30 minutes old,
 * and for this account (`linkUserId`, Settings) or for none (the phone step).
 * Null when there is no such sign-in.
 */
export async function lockPendingSignIn(
  tx: Transaction,
  token: string,
  now: Date,
  linkUserId: string | null,
): Promise<PendingSignIn | null> {
  const [row] = await tx
    .select({
      id: providerSignIns.id,
      provider: providerSignIns.provider,
      subject: providerSignIns.subject,
      email: providerSignIns.email,
      firstName: providerSignIns.firstName,
      expiresAt: providerSignIns.expiresAt,
    })
    .from(providerSignIns)
    .where(
      and(
        eq(providerSignIns.pendingHash, hashToken(token)),
        gt(providerSignIns.expiresAt, now),
        isNotNull(providerSignIns.answeredAt),
        linkUserId === null
          ? isNull(providerSignIns.linkUserId)
          : eq(providerSignIns.linkUserId, linkUserId),
      ),
    )
    .for("update");
  if (row === undefined || row.subject === null) return null;
  return { ...row, provider: row.provider as SignInProvider, subject: row.subject };
}

/** Who has this provider account now, and the account's own link of this provider. */
export async function linkStateOf(
  tx: Transaction,
  input: {
    readonly provider: SignInProvider;
    readonly subject: string;
    readonly accountId: string | null;
  },
): Promise<{
  readonly subjectOwnerId: string | null;
  readonly accountLink: { readonly id: string; readonly subject: string } | null;
}> {
  const [owner] = await tx
    .select({ userId: identities.userId })
    .from(identities)
    .where(and(eq(identities.provider, input.provider), eq(identities.subject, input.subject)));
  const [link] =
    input.accountId === null
      ? []
      : await tx
          .select({ id: identities.id, subject: identities.subject })
          .from(identities)
          .where(
            and(eq(identities.userId, input.accountId), eq(identities.provider, input.provider)),
          );
  return { subjectOwnerId: owner?.userId ?? null, accountLink: link ?? null };
}

/**
 * Puts the provider's verified email on the account when R19.4 allows:
 * into an empty email, or in place of the relay address of the link being
 * replaced; never one another account has. The unique index has the last
 * word, in a savepoint, so a race leaves the email as it was.
 */
async function fillEmail(
  tx: Transaction,
  input: {
    readonly userId: string;
    readonly providerEmail: string | null;
    readonly replacedLinkEmail: string | null;
    readonly now: Date;
  },
): Promise<void> {
  const { userId, providerEmail, now } = input;
  if (providerEmail === null) return;
  const [account] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId));
  const [other] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, providerEmail), ne(users.id, userId)))
    .limit(1);
  const email = emailToStore({
    providerEmail,
    accountEmail: account?.email ?? null,
    takenByOther: other !== undefined,
    replacedLinkEmail: input.replacedLinkEmail,
  });
  if (email === null) return;
  try {
    await tx.transaction((savepoint) =>
      savepoint
        .update(users)
        .set({ email, emailVerifiedAt: now, updatedAt: now })
        .where(eq(users.id, userId)),
    );
  } catch (error) {
    if (!uniqueViolation(error, "users_email_unique")) throw error;
  }
}

/** What became of a waiting sign-in, for the app's notice (spec 19, 3.3). */
export interface LinkOutcome {
  readonly provider: SignInProvider;
  readonly outcome: "created" | "linked" | "replaced" | "already_linked" | "in_use";
  readonly email: string | null;
}

/** The constraint that keeps a provider account on one ShareRide account (R19.1). */
export const subjectTakenConstraint = "identities_provider_subject_unique";
/** The constraint that keeps one of each provider on an account (R19.1). */
export const providerTakenConstraint = "identities_user_provider_unique";

/**
 * Carries out a link decision for the account and ends the waiting sign-in.
 * A race the unique indexes lose throws; the caller turns it into
 * `provider_in_use` or `provider_already_linked`.
 */
export async function applyLink(
  tx: Transaction,
  input: {
    readonly decision: LinkDecision;
    readonly pending: PendingSignIn;
    readonly userId: string;
    readonly now: Date;
  },
): Promise<LinkOutcome> {
  const { decision, pending, userId, now } = input;
  const done = (outcome: LinkOutcome["outcome"]): LinkOutcome => ({
    provider: pending.provider,
    outcome,
    email: pending.email,
  });
  await tx.delete(providerSignIns).where(eq(providerSignIns.id, pending.id));

  const link = async (replacedLinkEmail: string | null) => {
    await tx.insert(identities).values({
      userId,
      provider: pending.provider,
      subject: pending.subject,
      email: pending.email,
      linkedAt: now,
      lastUsedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await fillEmail(tx, { userId, providerEmail: pending.email, replacedLinkEmail, now });
  };

  switch (decision.action) {
    case "create":
      await link(null);
      return done("created");
    case "link":
      await link(null);
      return done("linked");
    case "replace": {
      const [replaced] = await tx
        .delete(identities)
        .where(and(eq(identities.id, decision.replacedIdentityId), eq(identities.userId, userId)))
        .returning({ email: identities.email });
      await link(replaced?.email ?? null);
      return done("replaced");
    }
    case "already_linked":
      await tx
        .update(identities)
        .set({ lastUsedAt: now, updatedAt: now })
        .where(
          and(eq(identities.provider, pending.provider), eq(identities.subject, pending.subject)),
        );
      return done("already_linked");
    case "refuse":
      return done("in_use");
  }
}
