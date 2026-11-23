import { schema, type Database } from "@shareride/db";
import {
  checkEmailLink,
  checkRateLimits,
  emailChangeNeedsCode,
  emailLinkRules,
  err,
  normaliseEmail,
  ok,
  type RateLimited,
  type Result,
} from "@shareride/domain";
import { createTranslator, type Locale } from "@shareride/i18n";
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import type { Logger } from "../../logger.ts";
import { hashToken, newToken } from "../../platform/crypto.ts";
import { MaybeSent } from "../../platform/maybe-sent.ts";
import type { EmailChannel } from "../../platform/email.ts";
import { emailContent, type EmailContent } from "../notifications/email-content.ts";
import { uniqueViolation } from "../../platform/database-errors.ts";
import { sendEmailChangedNotice } from "../auth/emails.ts";

// Adding an email (spec 1, 3.5; plan 4.6). The address waits with a link
// sent to it, and becomes the account's, verified, once the link is opened.
// The email goes from the request, like a sign-in code: it is not about a
// booking, so not through the notification worker.

const { emailVerifications, users } = schema;

export type AskError =
  | { readonly code: "email_invalid" }
  | { readonly code: "email_unavailable" }
  | { readonly code: "email_failed" }
  | RateLimited;

export type VerifyError = { readonly code: "link_invalid" } | { readonly code: "email_taken" };

export interface EmailService {
  /**
   * Whether asking for this address needs a confirm code first: a new
   * email signs in, so it does, always in place of a verified email; an
   * account without one adds it freely while sign-up is unfinished or
   * within 30 minutes of being made (spec 26, R26.5). The address the
   * account already has, or the one waiting for its link, needs none.
   */
  needsCode(userId: string, address: string): Promise<boolean>;
  /** Sends a link to the address, unless it is already the account's verified email. */
  ask(userId: string, input: string): Promise<Result<undefined, AskError>>;
  /** Makes the link's address the account's verified email. */
  verify(token: string): Promise<Result<{ readonly email: string }, VerifyError>>;
}

/** The email with the link that confirms an address, in the reader's language. */
export function verifyEmailContent(locale: Locale, webAppUrl: string, token: string): EmailContent {
  const t = createTranslator(locale);
  return emailContent(
    {
      title: t("email.verifySubject"),
      body: t("email.verifyBody"),
      // After the #, so the token never reaches the server's request logs.
      path: `/verify-email#${token}`,
    },
    locale,
    webAppUrl,
    { open: t("email.verifyOpen"), footer: t("email.verifyFooter") },
  );
}

/** The address waiting for its link, if the newest link sent still works. */
export async function pendingEmailOf(
  db: Database,
  userId: string,
  now: Date,
): Promise<string | null> {
  const [newest] = await db
    .select({
      email: emailVerifications.email,
      sentAt: emailVerifications.sentAt,
      usedAt: emailVerifications.usedAt,
      failedAt: emailVerifications.failedAt,
    })
    .from(emailVerifications)
    .where(and(eq(emailVerifications.userId, userId), isNull(emailVerifications.failedAt)))
    .orderBy(desc(emailVerifications.sentAt), desc(emailVerifications.id))
    .limit(1);
  if (newest === undefined) return null;
  return checkEmailLink({ ...newest, newest: true }, now).ok ? newest.email : null;
}

export function createEmailService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly logger: Logger;
  readonly email?: EmailChannel;
}): EmailService {
  const { db, clock, logger, email } = dependencies;

  return {
    async needsCode(userId, address) {
      const [user] = await db
        .select({
          email: users.email,
          verifiedAt: users.emailVerifiedAt,
          createdAt: users.createdAt,
          firstName: users.firstName,
        })
        .from(users)
        .where(eq(users.id, userId));
      if (user === undefined) throw new Error("The signed-in user does not exist.");
      const hasVerifiedEmail = user.email !== null && user.verifiedAt !== null;
      if (hasVerifiedEmail && user.email === address) return false;
      // Its link sent again: the address was let through when first asked for.
      if ((await pendingEmailOf(db, userId, clock())) === address) return false;
      return emailChangeNeedsCode(
        { createdAt: user.createdAt, hasVerifiedEmail, signedUp: user.firstName !== null },
        clock(),
      );
    },

    async ask(userId, input) {
      if (email === undefined) return err({ code: "email_unavailable" });
      const address = normaliseEmail(input);
      if (!address.ok) return address;
      const now = clock();
      const token = newToken("emailLink");
      const asked = await db.transaction(async (tx) => {
        // One request at a time per account, so the limits hold.
        const [user] = await tx
          .select({ email: users.email, verifiedAt: users.emailVerifiedAt, locale: users.locale })
          .from(users)
          .where(eq(users.id, userId))
          .for("update");
        if (user === undefined) throw new Error("The signed-in user does not exist.");
        if (user.email === address.value && user.verifiedAt !== null) {
          // The email in use: a change waiting for its link is given up. Its
          // link stops working, as if used, and still counts towards the limits.
          await tx
            .update(emailVerifications)
            .set({ usedAt: now, updatedAt: now })
            .where(and(eq(emailVerifications.userId, userId), isNull(emailVerifications.usedAt)));
          return ok(null);
        }
        // Refused ones count too, so a refused address cannot be tried without end.
        const earlier = await tx
          .select({ sentAt: emailVerifications.sentAt })
          .from(emailVerifications)
          .where(
            and(
              eq(emailVerifications.userId, userId),
              gt(
                emailVerifications.sentAt,
                new Date(now.getTime() - emailLinkRules.validForSeconds * 1000),
              ),
            ),
          );
        const allowed = checkRateLimits(
          earlier.map((row) => row.sentAt),
          emailLinkRules.sendLimits,
          now,
        );
        if (!allowed.ok) return allowed;
        const [link] = await tx
          .insert(emailVerifications)
          .values({
            userId,
            email: address.value,
            tokenHash: hashToken(token),
            sentAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: emailVerifications.id });
        if (link === undefined) throw new Error("The link was not stored.");
        return ok({ id: link.id, locale: user.locale === "is" ? "is" : "en" } as const);
      });
      if (!asked.ok) return asked;
      if (asked.value === null) return ok(undefined);
      const { id, locale } = asked.value;
      const content = verifyEmailContent(locale, email.webAppUrl, token);
      try {
        await email.sender.send({ to: address.value, ...content, idempotencyKey: id });
      } catch (error) {
        // The error says why, never to whom: providers' errors carry no address.
        if (error instanceof MaybeSent) {
          // It may have arrived: the link stays, and another can be asked for.
          logger.warn({ err: error, link: id }, "email link may not have been sent");
          return ok(undefined);
        }
        logger.error({ err: error, link: id }, "email link not sent");
        const failedAt = clock();
        await db
          .update(emailVerifications)
          .set({ failedAt, updatedAt: failedAt })
          .where(eq(emailVerifications.id, id));
        return err({ code: "email_failed" });
      }
      logger.info({ link: id }, "email link sent");
      return ok(undefined);
    },

    async verify(token) {
      const now = clock();
      try {
        const verified = await db.transaction(async (tx) => {
          const [link] = await tx
            .select()
            .from(emailVerifications)
            .where(eq(emailVerifications.tokenHash, hashToken(token)))
            .for("update");
          if (link === undefined) return err({ code: "link_invalid" } as const);
          const [newer] = await tx
            .select({ id: emailVerifications.id })
            .from(emailVerifications)
            .where(
              and(
                eq(emailVerifications.userId, link.userId),
                gt(emailVerifications.sentAt, link.sentAt),
                isNull(emailVerifications.failedAt),
              ),
            )
            .limit(1);
          const works = checkEmailLink({ ...link, newest: newer === undefined }, now);
          if (!works.ok) return works;
          await tx
            .update(emailVerifications)
            .set({ usedAt: now, updatedAt: now })
            .where(eq(emailVerifications.id, link.id));
          const [other] = await tx
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.email, link.email), ne(users.id, link.userId)))
            .limit(1);
          if (other !== undefined) return err({ code: "email_taken" } as const);
          const [before] = await tx
            .select({ email: users.email, verifiedAt: users.emailVerifiedAt, locale: users.locale })
            .from(users)
            .where(eq(users.id, link.userId))
            .for("update");
          await tx
            .update(users)
            .set({ email: link.email, emailVerifiedAt: now, updatedAt: now })
            .where(eq(users.id, link.userId));
          // Only an address the person proved is told of the change (R26.6).
          const oldEmail =
            before === undefined || before.verifiedAt === null || before.email === link.email
              ? null
              : before.email;
          return ok({
            email: link.email,
            notice:
              oldEmail === null
                ? null
                : {
                    userId: link.userId,
                    oldEmail,
                    newEmail: link.email,
                    locale: before?.locale === "is" ? ("is" as const) : ("en" as const),
                  },
          });
        });
        if (!verified.ok) return verified;
        // The old address is told (spec 26, R26.6).
        if (verified.value.notice !== null) {
          await sendEmailChangedNotice(email, logger, verified.value.notice);
        }
        return ok({ email: verified.value.email });
      } catch (error) {
        // Another account verified the same address at the same moment.
        if (uniqueViolation(error, "users_email_unique")) return err({ code: "email_taken" });
        throw error;
      }
    },
  };
}
