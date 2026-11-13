import { err, ok, type Result } from "../result.ts";

/**
 * Languages people can say they speak (spec 1, section 3.5), as ISO 639-1
 * codes. Names are shown from the translations.
 */
export const spokenLanguages = [
  "is",
  "en",
  "pl",
  "lt",
  "lv",
  "uk",
  "ru",
  "de",
  "fr",
  "es",
  "it",
  "pt",
  "nl",
  "da",
  "sv",
  "no",
  "fi",
  "fo",
  "ro",
  "hu",
  "cs",
  "sk",
  "th",
  "tl",
  "vi",
  "zh",
  "ja",
  "ar",
] as const;

export type SpokenLanguage = (typeof spokenLanguages)[number];

/** Limits on profile text (spec 1, section 3.5), in characters as people count them. */
export const profileRules = {
  firstNameMaxLength: 30,
  aboutMaxLength: 300,
} as const;

export interface ProfileChanges {
  readonly firstName?: string;
  readonly about?: string;
  readonly languages?: readonly string[];
}

export interface ValidProfileChanges {
  readonly firstName?: string;
  readonly about?: string | null;
  readonly languages?: readonly SpokenLanguage[];
}

export interface ProfileError {
  readonly code: "profile_invalid";
  readonly field: "firstName" | "about" | "languages";
}

// Letters of any alphabet, with single spaces, hyphens or apostrophes between.
const firstNamePattern = /^\p{L}+(?:[ '’-]\p{L}+)*$/u;

/**
 * Text as stored: composed (NFC), so "Ó" is one character however it was
 * typed, and trimmed.
 */
const tidy = (text: string) => text.normalize("NFC").trim();

/** Characters as people count them, closely enough for names and short texts. */
const characterCount = (text: string) => Array.from(text).length;

/** Checks and tidies profile edits (spec 1, section 3.5). */
export function validateProfileChanges(
  changes: ProfileChanges,
): Result<ValidProfileChanges, ProfileError> {
  const valid: { -readonly [K in keyof ValidProfileChanges]: ValidProfileChanges[K] } = {};

  if (changes.firstName !== undefined) {
    const firstName = tidy(changes.firstName);
    if (
      characterCount(firstName) > profileRules.firstNameMaxLength ||
      !firstNamePattern.test(firstName)
    ) {
      return err({ code: "profile_invalid", field: "firstName" });
    }
    valid.firstName = firstName;
  }

  if (changes.about !== undefined) {
    const about = tidy(changes.about);
    if (characterCount(about) > profileRules.aboutMaxLength) {
      return err({ code: "profile_invalid", field: "about" });
    }
    valid.about = about === "" ? null : about;
  }

  if (changes.languages !== undefined) {
    const known = new Set<string>(spokenLanguages);
    const unique = new Set(changes.languages);
    if (unique.size !== changes.languages.length || changes.languages.some((l) => !known.has(l))) {
      return err({ code: "profile_invalid", field: "languages" });
    }
    valid.languages = changes.languages as readonly SpokenLanguage[];
  }

  return ok(valid);
}
