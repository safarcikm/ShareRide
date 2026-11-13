/**
 * Countries whose phone numbers can sign up (spec 1, decision 3): Iceland,
 * the other EEA countries, the United Kingdom, the United States and Canada.
 * ISO 3166-1 alpha-2 codes, Iceland first as the default.
 */
export const supportedCountries = [
  "IS",
  // European Union
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  // The rest of the EEA
  "LI",
  "NO",
  // Others
  "GB",
  "US",
  "CA",
] as const;

export type SupportedCountry = (typeof supportedCountries)[number];

const supportedSet: ReadonlySet<string> = new Set(supportedCountries);

export function isSupportedCountry(country: string): country is SupportedCountry {
  return supportedSet.has(country);
}
