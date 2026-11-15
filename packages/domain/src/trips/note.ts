// The driver's note to passengers (spec 3, 3.7.4, rule R3.10): up to 500
// characters and no contact details, so contact stays in the app's chat.

export const noteMaxLength = 500;

export type ContactKind = "phone" | "email" | "link";

export type NoteProblem =
  | { readonly code: "note_too_long" }
  | { readonly code: "note_has_contact_details"; readonly kinds: readonly ContactKind[] };

/**
 * Dates such as 2026-11-14, 4.11.2026 or 4/11/2026, which would otherwise
 * read as phone numbers.
 */
const dates = /\d{4}-\d{2}-\d{2}|\d{1,2}\.\s?\d{1,2}\.\s?\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}/g;

/** Hyphens, dashes, dots, spaces and brackets people put between digits. */
const gap = "[\\s().\\-\u2013\u2014]";

/**
 * An Icelandic number: seven digits, the first from 4 to 8, however they
 * are spaced, such as 555 1234, 555 - 12 34 or 5551234. Digits right before
 * or after it make it part of a longer number, so ranges such as 2500-3000
 * and 2025 - 2026 are not phone numbers. Or any number written with + or
 * 00 and at least eight digits after it, such as +354 555 1234.
 */
const phone = new RegExp(
  `(?<!\\d)[4-8](?:${gap}*\\d){6}(?!${gap}*\\d)|(?<!\\d)(?:\\+|00)${gap}*\\d(?:${gap}*\\d){7,}`,
  "u",
);

const email = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;

/** Top-level domains common enough that a bare name such as dæmi.is is a link. */
const topLevelDomains =
  "is|com|net|org|io|eu|info|app|biz|co|uk|dk|no|se|fi|de|fo|me|ly|ee|to|gg|tv|xyz|link|page|site|online|shop|store";

/**
 * An address (http, www), a name with a path such as t.me/anna or
 * bit.ly/x, or a name ending in a common top-level domain such as dæmi.is.
 */
const link = new RegExp(
  "https?:\\/\\/|(?<![\\p{L}\\p{N}])www\\." +
    "|(?<![\\p{L}\\p{N}.])[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*\\.\\p{L}{2,}\\/" +
    `|(?<![\\p{L}\\p{N}.])[\\p{L}\\p{N}-]+\\.(?:${topLevelDomains})(?![\\p{L}\\p{N}])`,
  "iu",
);

/** The kinds of contact details in a text, each once. */
export function contactDetailsIn(text: string): ContactKind[] {
  const kinds: ContactKind[] = [];
  if (phone.test(text.replace(dates, " "))) kinds.push("phone");
  // An email address also ends in a domain; only a link outside one counts.
  const withoutEmails = text.replace(email, " ");
  if (withoutEmails !== text) kinds.push("email");
  if (link.test(withoutEmails)) kinds.push("link");
  return kinds;
}

/** What is wrong with a note; nothing for an empty one. */
export function checkNote(note: string): NoteProblem[] {
  const problems: NoteProblem[] = [];
  // Characters as the database counts them (code points), like car names.
  if (Array.from(note.normalize("NFC")).length > noteMaxLength) {
    problems.push({ code: "note_too_long" });
  }
  const kinds = contactDetailsIn(note);
  if (kinds.length > 0) problems.push({ code: "note_has_contact_details", kinds });
  return problems;
}
