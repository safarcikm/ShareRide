import { createTranslator, type Locale } from "@shareride/i18n";
import type { NotificationText } from "./texts.ts";

// The email for a notification (plan 4.6): its title as the subject, its
// words, a plain link to the screen it is about, and a footer that will
// carry the company's details (spec 13). Readable without images, and
// nothing that tracks opens or clicks (R7.9).

export interface EmailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

const escapes: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escaped = (text: string) => text.replace(/[&<>"']/g, (character) => escapes[character] ?? "");

/** The link's words and the footer, when not those of a notification. */
export interface EmailWords {
  readonly open: string;
  readonly footer: string;
}

/** `webAppUrl` is an origin, such as https://shareride.is. */
export function emailContent(
  notification: NotificationText,
  locale: Locale,
  webAppUrl: string,
  words?: EmailWords,
): EmailContent {
  const t = createTranslator(locale);
  const link = `${webAppUrl}${notification.path}`;
  const open = words?.open ?? t("email.open");
  const footer = words?.footer ?? t("email.footer");
  const text = [notification.body, "", `${open}: ${link}`, "", footer].join("\n");
  const html = [
    "<!doctype html>",
    `<html lang="${locale}">`,
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
    `<title>${escaped(notification.title)}</title></head>`,
    "<body>",
    `<p>${escaped(notification.body).replaceAll("\n", "<br>")}</p>`,
    `<p><a href="${escaped(link)}">${escaped(open)}</a></p>`,
    "<hr>",
    `<p><small>${escaped(footer)}</small></p>`,
    "</body>",
    "</html>",
  ].join("\n");
  return { subject: notification.title, text, html };
}
