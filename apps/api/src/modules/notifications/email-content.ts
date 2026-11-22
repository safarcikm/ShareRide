import { createTranslator, type Locale } from "@shareride/i18n";
import type { EmailImage } from "../../platform/email.ts";
import { emailHtml } from "./email-layout.ts";
import { emailLogo } from "./email-logo.ts";
import type { NotificationText } from "./texts.ts";

// The email for a notification (plan 4.6), in the PuffinRide layout (spec
// 24): its title as the subject and heading, its words, one button to the
// screen it is about, and a footer that will carry the company's details
// (spec 13). Readable without pictures, with a plain-text part of the same
// words, and nothing that tracks opens or clicks (R7.9, R24.2).

export interface EmailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /** The pictures the HTML shows: the puffin pin. */
  readonly images: readonly EmailImage[];
}

/** The link's words and the footer, when not those of a notification. */
export interface EmailWords {
  readonly open: string;
  readonly footer: string;
}

/**
 * The words as paragraphs, split at blank lines. Words that start with the
 * title, as a statement of reasons does, start after it (spec 24, 3.1).
 */
function paragraphsOf(words: string, title: string): string[] {
  const paragraphs = words.split(/\n[ \t]*\n+/).filter((paragraph) => paragraph.trim() !== "");
  return paragraphs.length > 1 && paragraphs[0] === title ? paragraphs.slice(1) : paragraphs;
}

/** `webAppUrl` is an origin, such as https://puffinride.is. */
export function emailContent(
  notification: NotificationText,
  locale: Locale,
  webAppUrl: string,
  words?: EmailWords,
): EmailContent {
  const t = createTranslator(locale);
  const { title } = notification;
  const link = `${webAppUrl}${notification.path}`;
  const open = words?.open ?? notification.open ?? t("email.open");
  const footer = words?.footer ?? t("email.footer");
  const name = t("app.name");
  const paragraphs = paragraphsOf(notification.emailBody ?? notification.body, title);
  const text = [
    title,
    "",
    paragraphs.join("\n\n"),
    "",
    `${open}: ${link}`,
    "",
    "--",
    footer,
    `${name} · ${webAppUrl}`,
  ].join("\n");
  const html = emailHtml({
    locale,
    title,
    paragraphs,
    button: { label: open, href: link },
    footer,
    name,
    home: { label: new URL(webAppUrl).host, href: webAppUrl },
    logo: emailLogo,
  });
  return { subject: title, text, html, images: [emailLogo] };
}
