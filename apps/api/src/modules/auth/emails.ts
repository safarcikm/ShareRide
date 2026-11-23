import { hideEmail } from "@shareride/domain";
import { createTranslator, type Locale } from "@shareride/i18n";
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
      path: "/settings",
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
