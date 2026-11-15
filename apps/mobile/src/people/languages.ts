import type { Me } from "@shareride/contracts";
import { spokenLanguages } from "@shareride/domain";
import { languageNames, type Locale } from "@shareride/i18n";

const isSpokenLanguage = (code: string): code is (typeof spokenLanguages)[number] =>
  spokenLanguages.some((known) => known === code);

/** "Icelandic, English": the languages I speak, leaving out any this version doesn't know. */
export function languagesText(me: Me, locale: Locale): string {
  return me.languages
    .filter(isSpokenLanguage)
    .map((code) => languageNames[locale][code])
    .join(", ");
}
