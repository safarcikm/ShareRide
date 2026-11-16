import { createTranslator, formatDay, locales } from "@shareride/i18n";
import { describe, expect, it } from "vitest";

// Icelandic letters such as ð and þ are outside the basic GSM alphabet, so
// every message goes as UCS-2 (sms-vonage.ts), where one SMS part holds 70
// characters and each part of a longer message 67.
const onePart = 70;
const twoParts = 2 * 67;

/** The longest day name of a year, such as "miðvikudagur 30. september". */
function longestDay(locale: (typeof locales)[number]): string {
  const days = Array.from({ length: 366 }, (_unused, index) =>
    formatDay(new Date(Date.UTC(2026, 0, 1 + index, 12)), locale),
  );
  return days.reduce((longest, day) => (day.length > longest.length ? day : longest));
}

describe("SMS texts", () => {
  it.each(locales)("give a sign-in code in one part in %s, with no link", (locale) => {
    const text = createTranslator(locale)("sms.signInCode", { code: "123456" });
    expect(text.length).toBeLessThanOrEqual(onePart);
    expect(text).not.toMatch(/https?:|www\./);
  });

  it.each(locales)(
    "tell of a cancelled booking in two parts at most in %s, with no link",
    (locale) => {
      const t = createTranslator(locale);
      const when = { date: longestDay(locale), time: "23:45" };
      for (const text of [t("sms.bookingCancelled", when), t("sms.bookingCancelledUnpaid", when)]) {
        expect(text.length).toBeLessThanOrEqual(twoParts);
        expect(text).not.toMatch(/https?:|www\.|[{}]/);
      }
    },
  );
});
