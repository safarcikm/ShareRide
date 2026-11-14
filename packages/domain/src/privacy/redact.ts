/**
 * Removes personal data and secrets before anything leaves for a log or an
 * error report (privacy and GDPR, "Logs and error reports"): phone numbers,
 * sign-in codes, tokens, email addresses, kennitölur, number plates and the values of a
 * failed query. Fails towards removing too much: a six-digit number that is
 * not a code is hidden too.
 */

/** Keys whose values are personal data or secrets, wherever they appear. */
export const personalDataKeys = [
  "phone",
  "phoneNumber",
  "phoneE164",
  "code",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
  "password",
  "email",
  "firstName",
  "lastName",
  "about",
  "deviceName",
  "ipAddress",
  // A car's number plate.
  "registration",
  "latitude",
  "longitude",
] as const;

/** first_name, first-name and firstName are the same key. */
const normalise = (key: string) => key.toLowerCase().replace(/[-_]/g, "");

const exactKeys = new Set(personalDataKeys.map(normalise));
/** Parts of key names that always mean personal data or a secret, such as set-cookie. */
const keyParts = ["token", "cookie", "secret", "password", "authorization", "phone", "email"];

const isPersonalKey = (key: string): boolean => {
  const normalised = normalise(key);
  return exactKeys.has(normalised) || keyParts.some((part) => normalised.includes(part));
};

/** Digits not glued to letters, digits or hyphens (so not inside IDs or dates). */
const alone = (pattern: string) => new RegExp(`(?<![\\w-])${pattern}(?![\\w-])`, "g");

const patterns: readonly (readonly [RegExp, string])[] = [
  // A failed query's message lists every value it was given.
  [/\nparams: [\s\S]*$/, "\nparams: [redacted]"],
  [/sr_(?:at|rt)_[A-Za-z0-9_-]+/g, "[token]"],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g, "[email]"],
  // International numbers, also with + and spaces written into a URL.
  [/%2B\d(?:(?:%20|[ \u00A0-])?\d){6,14}/gi, "[number]"],
  [/\+\d(?:[ \u00A0-]?\d){6,14}/g, "[number]"],
  // A kennitala, with or without its hyphen.
  [alone("\\d{6}-?\\d{4}"), "[number]"],
  [alone("\\d{7,15}"), "[number]"],
  [alone("\\d{3}[ -]\\d{4}"), "[number]"],
  [alone("\\d{6}"), "[code]"],
];

export function redactText(text: string): string {
  return patterns.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    text,
  );
}

const maxDepth = 20;

/**
 * A copy of a JSON-like value with personal data keys replaced and every
 * string passed through redactText. The input is not changed.
 */
export function redactDeep<T>(value: T): T {
  return walk(value, 0) as T;
}

function walk(value: unknown, depth: number): unknown {
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= maxDepth) return "[too deep]";
  if (Array.isArray(value)) return value.map((item: unknown) => walk(item, depth + 1));
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    copy[key] = isPersonalKey(key) ? "[redacted]" : walk(item, depth + 1);
  }
  return copy;
}
