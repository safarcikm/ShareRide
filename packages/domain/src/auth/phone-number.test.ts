import { describe, expect, it } from "vitest";
import { callingCode, formatPhoneNumber, normalisePhoneNumber } from "./phone-number.ts";

describe("normalisePhoneNumber (rules R1.1 and R1.5)", () => {
  it("reads an Icelandic mobile number without a country code as Icelandic", () => {
    expect(normalisePhoneNumber("690 0000")).toEqual({
      ok: true,
      value: { e164: "+3546900000", country: "IS", callingCode: "354" },
    });
  });

  it("accepts the same number with +354, spaces and dashes", () => {
    expect(normalisePhoneNumber("+354 690-0000")).toMatchObject({
      ok: true,
      value: { e164: "+3546900000" },
    });
  });

  it("accepts mobile numbers from other supported countries", () => {
    expect(normalisePhoneNumber("+48 512 345 678")).toMatchObject({
      ok: true,
      value: { e164: "+48512345678", country: "PL", callingCode: "48" },
    });
    expect(normalisePhoneNumber("+44 7400 123456")).toMatchObject({
      ok: true,
      value: { country: "GB" },
    });
    expect(normalisePhoneNumber("+1 202 555 0143")).toMatchObject({
      ok: true,
      value: { country: "US" },
    });
  });

  it("uses the chosen country for numbers without a country code", () => {
    expect(normalisePhoneNumber("512 345 678", "PL")).toMatchObject({
      ok: true,
      value: { e164: "+48512345678" },
    });
  });

  it("rejects a landline, which cannot receive a code by SMS", () => {
    expect(normalisePhoneNumber("+354 551 0000")).toEqual({
      ok: false,
      error: { code: "phone_invalid" },
    });
  });

  it("rejects numbers from countries that are not supported yet", () => {
    expect(normalisePhoneNumber("+41 78 123 45 67")).toEqual({
      ok: false,
      error: { code: "phone_country_unsupported", country: "CH" },
    });
  });

  it.each(["", "abc", "12", "+354 690 00000 000"])("rejects %j", (input) => {
    expect(normalisePhoneNumber(input)).toEqual({ ok: false, error: { code: "phone_invalid" } });
  });
});

describe("callingCode", () => {
  it("gives the country calling code for the country picker", () => {
    expect(callingCode("IS")).toBe("354");
    expect(callingCode("GB")).toBe("44");
    expect(callingCode("US")).toBe("1");
  });
});

describe("formatPhoneNumber", () => {
  it("shows an E.164 number in the international format people read", () => {
    expect(formatPhoneNumber("+3546900000")).toBe("+354 690 0000");
    expect(formatPhoneNumber("+48512345678")).toBe("+48 512 345 678");
  });

  it("leaves text that is not a phone number as it is", () => {
    expect(formatPhoneNumber("not a number")).toBe("not a number");
  });
});
