import { spokenLanguages } from "@shareride/domain";
import { languageNames, type Locale } from "@shareride/i18n";

const isSpokenLanguage = (code: string): code is (typeof spokenLanguages)[number] =>
  spokenLanguages.some((known) => known === code);

/** "Icelandic, English": the languages someone speaks, leaving out any this version doesn't know. */
export function languagesText(
  person: { readonly languages: readonly string[] },
  locale: Locale,
): string {
  return person.languages
    .filter(isSpokenLanguage)
    .map((code) => languageNames[locale][code])
    .join(", ");
}
