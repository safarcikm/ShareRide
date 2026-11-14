import { DrizzleQueryError } from "drizzle-orm/errors";
import pg from "pg";

/** Fields of a database error that name things, never values. */
const namingFields = [
  "severity",
  "code",
  "schema",
  "table",
  "column",
  "dataType",
  "constraint",
  "routine",
] as const;

const maxCauses = 8;

/**
 * A copy of an error without the values of the query that failed, for logs
 * and error reports (privacy and GDPR, "Logs and error reports"). A failed
 * query's message lists every bound value, such as a name or an email, and
 * a database error's detail repeats the values of a key. The query text,
 * the database's error code and the names of the constraint, table and
 * column stay, which is what a fix needs. Other errors come back as they
 * are unless one of their causes is a failed query.
 */
export function withoutQueryValues(error: Error): Error;
export function withoutQueryValues(error: unknown): unknown;
export function withoutQueryValues(error: unknown): unknown {
  return clean(error, 0);
}

function clean(error: unknown, depth: number): unknown {
  if (!(error instanceof Error)) return error;
  if (depth >= maxCauses) return new Error("[further causes left out]");
  if (error instanceof DrizzleQueryError) {
    return rebuilt(error, "Error", `Failed query: ${error.query}`, clean(error.cause, depth + 1));
  }
  if (error instanceof pg.DatabaseError) {
    // PostgreSQL quotes names and values alike: keep the names it reports.
    const names = new Set(namingFields.map((field) => error[field]));
    const message = error.message.replace(/"([^"]*)"/g, (quoted, inner: string) =>
      names.has(inner) ? quoted : '"[value]"',
    );
    const safe = rebuilt(error, "DatabaseError", message);
    for (const field of namingFields) {
      if (error[field] !== undefined) Object.assign(safe, { [field]: error[field] });
    }
    return safe;
  }
  if (error.cause === undefined) return error;
  const cause = clean(error.cause, depth + 1);
  if (cause === error.cause) return error;
  const copy = new Error(error.message, { cause });
  const fields: [string, unknown][] = Object.entries(error);
  for (const [key, value] of fields) {
    if (key !== "cause") Object.assign(copy, { [key]: value });
  }
  copy.name = error.name;
  if (error.stack !== undefined) copy.stack = error.stack;
  return copy;
}

/** A new error with the original's stack frames under a new message. */
function rebuilt(original: Error, name: string, message: string, cause?: unknown): Error {
  const error = cause === undefined ? new Error(message) : new Error(message, { cause });
  error.name = name;
  error.stack = `${name}: ${message}${framesOf(original)}`;
  return error;
}

/** The "at …" lines of a stack, without its message, which can hold values. */
function framesOf(error: Error): string {
  const stack = error.stack ?? "";
  const header = `${error.name}: ${error.message}`;
  if (stack.startsWith(header)) return stack.slice(header.length);
  return stack
    .split("\n")
    .filter((line) => /^\s+at /.test(line))
    .map((line) => `\n${line}`)
    .join("");
}
