// Writes the key emails in both languages as files to look at (spec 24, 5):
//   pnpm --filter @shareride/api email-previews [folder]
// Each email is an .html file, with the puffin pin as a data address so a
// browser shows it (a mail app gets it inside the email), and a .txt file
// of its plain-text part. The folder is apps/api/email-previews/ unless
// given; git ignores it. Made-up people and places only; nothing is sent.
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultNotificationSettings } from "@shareride/domain";
import { locales, type Locale } from "@shareride/i18n";
import { verifyEmailContent } from "./modules/account/email.ts";
import { emailContent, type EmailContent } from "./modules/notifications/email-content.ts";
import { notificationText, type NotificationFacts } from "./modules/notifications/texts.ts";

const webAppUrl = "https://puffinride.is";
const folder = resolve(
  process.argv[2] ?? fileURLToPath(new URL("../email-previews", import.meta.url)),
);

// Saturday 14 November 2026, boarding at 09:00 in Iceland (UTC all year).
const booking: NotificationFacts = {
  kind: "booking_confirmed",
  role: "passenger",
  bookingId: "0190a1d6-0000-7000-8000-0000000000b1",
  tripId: "0190a1d6-0000-7000-8000-0000000000a1",
  name: "Jón",
  seats: 2,
  total: { amount: 5600, currency: "ISK" },
  cancelReason: null,
  refund: { amount: 0, currency: "ISK" },
  from: "BSÍ",
  to: "Hof, Akureyri",
  boardsAt: new Date("2026-11-14T09:00:00Z"),
  requestExpiresAt: new Date("2026-11-13T21:00:00Z"),
  paymentDueAt: null,
  message: null,
  boardPointId: "0190a1d6-0000-7000-8000-0000000000c1",
  car: { make: "Toyota", model: "Yaris", colour: "white" },
  newCar: null,
  newStop: null,
  removedStop: null,
  moved: null,
  paid: true,
  answerBy: null,
  pausedPoint: null,
  movedPoint: null,
};

const settings = defaultNotificationSettings;

/** Each preview's file name and its email in a language. */
const previews: Readonly<Record<string, (locale: Locale) => EmailContent>> = {
  "1-confirm-your-email": (locale) =>
    verifyEmailContent(locale, webAppUrl, "sr_ev_preview-not-a-real-token"),
  "2-booking-request": (locale) =>
    emailContent(
      notificationText(
        { ...booking, kind: "request_new", role: "driver", name: "Gunna" },
        locale,
        settings,
      ),
      locale,
      webAppUrl,
    ),
  "3-booking-confirmed": (locale) =>
    emailContent(notificationText(booking, locale, settings), locale, webAppUrl),
  "4-in-one-hour": (locale) =>
    emailContent(
      notificationText({ ...booking, kind: "reminder_hour" }, locale, settings),
      locale,
      webAppUrl,
    ),
  "5-how-was-your-trip": (locale) =>
    emailContent(
      notificationText({ ...booking, kind: "rate_trip" }, locale, settings),
      locale,
      webAppUrl,
    ),
  "6-statement-of-reasons": (locale) =>
    emailContent(
      notificationText(
        {
          kind: "moderation_action",
          action: "warning",
          rule: "offensive",
          reason:
            locale === "is"
              ? "Þú skrifaðir dónaleg skilaboð til farþega í spjallinu."
              : "You wrote rude messages to a passenger in the chat.",
          until: null,
          at: new Date("2026-11-14T12:00:00Z"),
          content: null,
        },
        locale,
        settings,
      ),
      locale,
      webAppUrl,
    ),
};

/** The HTML as a browser can show it: the pictures as data addresses. */
function forABrowser({ html, images }: EmailContent): string {
  return images.reduce(
    (page, image) =>
      page.replaceAll(
        `cid:${image.contentId}`,
        `data:${image.contentType};base64,${Buffer.from(image.content).toString("base64")}`,
      ),
    html,
  );
}

await mkdir(folder, { recursive: true });
for (const [name, make] of Object.entries(previews)) {
  for (const locale of locales) {
    const email = make(locale);
    await writeFile(join(folder, `${name}.${locale}.html`), forABrowser(email));
    await writeFile(
      join(folder, `${name}.${locale}.txt`),
      `Subject: ${email.subject}\n\n${email.text}\n`,
    );
  }
}
process.stdout.write(
  `Wrote ${String(Object.keys(previews).length * locales.length)} emails to ${folder}\n`,
);
