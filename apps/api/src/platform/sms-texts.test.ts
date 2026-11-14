import { createTranslator, locales } from "@shareride/i18n";
import { describe, expect, it } from "vitest";

// Icelandic letters such as ð and þ are outside the basic GSM alphabet, so
// those messages use UCS-2, where one SMS part holds 70 characters.
const onePart = 70;

describe("SMS texts", () => {
  it.each(locales)("fit one SMS part in %s, with no link", (locale) => {
    const text = createTranslator(locale)("sms.signInCode", { code: "123456" });
    expect(text.length).toBeLessThanOrEqual(onePart);
    expect(text).not.toMatch(/https?:|www\./);
  });
});
