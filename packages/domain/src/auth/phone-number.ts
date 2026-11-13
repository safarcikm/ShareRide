import { parsePhoneNumberFromString } from "libphonenumber-js/mobile";
import { isSupportedCountry, type SupportedCountry } from "../countries.ts";
import { err, ok, type Result } from "../result.ts";

export interface PhoneNumber {
  /** E.164, for example +3546900000 (rule R1.1). */
  readonly e164: string;
  readonly country: SupportedCountry;
  /** Country calling code without the plus, for per-prefix limits (R1.3). */
  readonly callingCode: string;
}

export type PhoneNumberError =
  | { readonly code: "phone_invalid" }
  | { readonly code: "phone_country_unsupported"; readonly country: string };

/**
 * Parses what a person typed into an E.164 mobile number from a supported
 * country (spec 1, rules R1.1 and R1.5). Only mobile numbers can receive a
 * code by SMS, so landlines are rejected. Numbers without a country code are
 * read as numbers from `defaultCountry`.
 */
export function normalisePhoneNumber(
  input: string,
  defaultCountry: SupportedCountry = "IS",
): Result<PhoneNumber, PhoneNumberError> {
  const parsed = parsePhoneNumberFromString(input, defaultCountry);
  if (parsed?.country === undefined || !parsed.isValid()) {
    return err({ code: "phone_invalid" });
  }
  const type = parsed.getType();
  if (type !== "MOBILE" && type !== "FIXED_LINE_OR_MOBILE") {
    return err({ code: "phone_invalid" });
  }
  if (!isSupportedCountry(parsed.country)) {
    return err({ code: "phone_country_unsupported", country: parsed.country });
  }
  return ok({
    e164: parsed.number,
    country: parsed.country,
    callingCode: parsed.countryCallingCode,
  });
}
