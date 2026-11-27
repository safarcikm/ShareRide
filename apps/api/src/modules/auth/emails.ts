import { schema, type Database } from "@shareride/db";
import { hideEmail, type DeviceName } from "@shareride/domain";
import { createTranslator, type Locale } from "@shareride/i18n";
import { eq } from "drizzle-orm";
import type { Logger } from "../../logger.ts";
import type { EmailChannel } from "../../platform/email.ts";
import { MaybeSent } from "../../platform/maybe-sent.ts";
import { emailContent, type EmailContent } from "../notifications/email-content.ts";

// The emails of signing in (spec 26): a code to sign in, a code to confirm,
// and the notice to an old address. They go from the request, like a
// text-message code, not through the notification worker.

/** The email with a sign-in or confirm code, in the reader's language (3.2, 3.6). */
export function codeEmailContent(
  purpose: "email_sign_in" | "confirm",
  locale: Locale,
  webAppUrl: string,
  code: string,
): EmailContent {
  const t = createTranslator(locale);
  const [subject, body] =
    purpose === "email_sign_in"
      ? (["email.signInCodeSubject", "email.signInCodeBody"] as const)
      : (["email.confirmCodeSubject", "email.confirmCodeBody"] as const);
  return emailContent(
    { title: t(subject, { code }), body: t(body, { code }), path: "/" },
    locale,
    webAppUrl,
    {
      open: t("email.open"),
      footer: t("email.codeFooter"),
    },
  );
}

/** To the old address when an account's email changes (R26.6): the new one partly hidden. */
export function emailChangedContent(
  locale: Locale,
  webAppUrl: string,
  newEmail: string,
): EmailContent {
  const t = createTranslator(locale);
  return emailContent(
    {
      title: t("email.emailChangedSubject"),
      body: t("email.emailChangedBody", { email: hideEmail(newEmail) }),
      // Profile, where the account's email and Send feedback are.
      path: "/profile",
    },
    locale,
    webAppUrl,
  );
}

/**
 * Sends a notice to an old address after its account's email changed.
 * Best effort: the change is made, so a failure is only logged, never with
 * an address.
 */
export async function sendEmailChangedNotice(
  channel: EmailChannel | undefined,
  logger: Logger,
  notice: {
    readonly userId: string;
    readonly oldEmail: string;
    readonly newEmail: string;
    readonly locale: Locale;
  },
): Promise<void> {
  if (channel === undefined) return;
  const content = emailChangedContent(notice.locale, channel.webAppUrl, notice.newEmail);
  try {
    await channel.sender.send({
      to: notice.oldEmail,
      ...content,
      idempotencyKey: `email-changed-${notice.userId}-${String(Date.now())}`,
    });
    logger.info({ userId: notice.userId }, "email change notice sent");
  } catch (error) {
    if (error instanceof MaybeSent) {
      logger.warn(
        { err: error, userId: notice.userId },
        "email change notice may not have been sent",
      );
      return;
    }
    logger.error({ err: error, userId: notice.userId }, "email change notice not sent");
  }
}

/** A change to how an account signs in, told to its verified email (spec 27, R27.7). */
export type SignInChange =
  | { readonly kind: "password_added" | "password_changed" | "password_removed" }
  | { readonly kind: "passkey_added"; readonly device: DeviceName | null };

const changeSubjects = {
  password_added: "email.passwordAddedSubject",
  password_changed: "email.passwordChangedSubject",
  password_removed: "email.passwordRemovedSubject",
  passkey_added: "email.passkeyAddedSubject",
} as const;

/** The notice of a new or removed way in, in the reader's language (R27.7). */
export function signInChangeContent(
  locale: Locale,
  webAppUrl: string,
  change: SignInChange,
): EmailContent {
  const t = createTranslator(locale);
  const what =
    change.kind === "passkey_added"
      ? t("email.passkeyAddedOn", {
          device:
            change.device === null
              ? t("passkey.someBrowser")
              : t("passkey.device", { ...change.device }),
        })
      : "";
  return emailContent(
    {
      title: t(changeSubjects[change.kind]),
      body: `${what}${t("email.signInChangeBody")}`,
      path: "/settings/sign-in-methods",
    },
    locale,
    webAppUrl,
  );
}

/**
 * Tells the account's verified email of a change to how it signs in. Best
 * effort, as `sendEmailChangedNotice`: the change is made, so a failure is
 * only logged, never with an address.
 */
export async function sendSignInChangeNotice(
  channel: EmailChannel | undefined,
  logger: Logger,
  notice: {
    readonly userId: string;
    readonly to: string;
    readonly locale: Locale;
    readonly change: SignInChange;
  },
): Promise<void> {
  if (channel === undefined) return;
  const content = signInChangeContent(notice.locale, channel.webAppUrl, notice.change);
  const kind = notice.change.kind;
  try {
    await channel.sender.send({
      to: notice.to,
      ...content,
      idempotencyKey: `${kind}-${notice.userId}-${String(Date.now())}`,
    });
    logger.info({ userId: notice.userId, kind }, "sign-in change notice sent");
  } catch (error) {
    if (error instanceof MaybeSent) {
      logger.warn(
        { err: error, userId: notice.userId, kind },
        "sign-in change notice may not have been sent",
      );
      return;
    }
    logger.error({ err: error, userId: notice.userId, kind }, "sign-in change notice not sent");
  }
}

/**
 * Tells the account's own verified email of a change to how it signs in
 * (R27.7); nothing when it has none, or the server sends no email.
 */
export async function tellVerifiedEmail(
  dependencies: {
    readonly db: Database;
    readonly email?: EmailChannel | undefined;
    readonly logger: Logger;
  },
  userId: string,
  change: SignInChange,
): Promise<void> {
  const { users } = schema;
  const [user] = await dependencies.db
    .select({ email: users.email, verifiedAt: users.emailVerifiedAt, locale: users.locale })
    .from(users)
    .where(eq(users.id, userId));
  if (user === undefined || user.email === null || user.verifiedAt === null) return;
  await sendSignInChangeNotice(dependencies.email, dependencies.logger, {
    userId,
    to: user.email,
    locale: user.locale === "is" ? "is" : "en",
    change,
  });
}
