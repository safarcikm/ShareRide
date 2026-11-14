// The driver's note to passengers (spec 3, 3.7.4, rule R3.10): up to 500
// characters and no contact details, so contact stays in the app's chat.

export const noteMaxLength = 500;

export type ContactKind = "phone" | "email" | "link";

export type NoteProblem =
  | { readonly code: "note_too_long" }
  | { readonly code: "note_has_contact_details"; readonly kinds: readonly ContactKind[] };

/** A date such as 2026-11-14, which would otherwise read as a phone number. */
const isoDate = /\d{4}-\d{2}-\d{2}/g;

/** Seven or more digits, with spaces, hyphens or brackets between them. */
const phone = /(?:\+|00)?\d(?:[\s()-]*\d){6,}/u;

const email = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;

/** An address, or a name ending in a common top-level domain such as dæmi.is. */
const link =
  /https?:\/\/|(?<![\p{L}\p{N}])www\.|(?<![\p{L}\p{N}.])[\p{L}\p{N}-]+\.(?:is|com|net|org|io|eu|info|app)(?![\p{L}\p{N}])/iu;

/** The kinds of contact details in a text, each once. */
export function contactDetailsIn(text: string): ContactKind[] {
  const kinds: ContactKind[] = [];
  if (phone.test(text.replace(isoDate, " "))) kinds.push("phone");
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
