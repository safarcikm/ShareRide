import { DrizzleQueryError } from "drizzle-orm/errors";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { withoutQueryValues } from "./safe-error.ts";

const query = 'update "users" set "first_name" = $1, "email" = $2 where "id" = $3';
const params = ["Sigríður", "sigga@example.com", "0b0c0d0e-0000-4000-8000-000000000001"];

function databaseError(): pg.DatabaseError {
  const error = new pg.DatabaseError(
    'duplicate key value violates unique constraint "users_email_key"',
    0,
    "error",
  );
  error.code = "23505";
  error.constraint = "users_email_key";
  error.table = "users";
  error.detail = "Key (email)=(sigga@example.com) already exists.";
  error.where = "SQL statement with Sigríður";
  return error;
}

const everything = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item instanceof Error
      ? {
          ...Object.fromEntries(Object.entries(item)),
          message: item.message,
          stack: item.stack,
          cause: item.cause,
        }
      : item,
  );

describe("withoutQueryValues", () => {
  it("keeps the query of a failed query but drops its values", () => {
    const failed = new DrizzleQueryError(query, params, new Error("connection lost"));

    const safe = withoutQueryValues(failed);

    expect(safe).toBeInstanceOf(Error);
    expect(safe.message).toBe(`Failed query: ${query}`);
    expect(safe.stack).toContain(`Failed query: ${query}`);
    expect(safe.stack).toContain("safe-error.test.ts");
    expect(safe.cause).toEqual(new Error("connection lost"));
    for (const value of params) expect(everything(safe)).not.toContain(value);
  });

  it("keeps a database error's code and names but drops the values it quotes", () => {
    const failed = new DrizzleQueryError(query, params, databaseError());

    const cause = withoutQueryValues(failed).cause as Record<string, unknown>;

    expect(cause).toMatchObject({
      code: "23505",
      constraint: "users_email_key",
      table: "users",
    });
    expect(cause["message"]).toBe(
      'duplicate key value violates unique constraint "users_email_key"',
    );
    expect(cause["detail"]).toBeUndefined();
    expect(cause["where"]).toBeUndefined();
    expect(everything(cause)).not.toContain("sigga@example.com");
    expect(everything(cause)).not.toContain("Sigríður");
  });

  it("hides a value the database quotes in its message", () => {
    const error = new pg.DatabaseError(
      'invalid input syntax for type uuid: "Sigríður"',
      0,
      "error",
    );
    error.code = "22P02";

    const safe = withoutQueryValues(error);

    expect(safe.message).toBe('invalid input syntax for type uuid: "[value]"');
    expect(safe.stack).not.toContain("Sigríður");
    expect(safe).toMatchObject({ code: "22P02" });
  });

  it("cleans a failed query wrapped in another error", () => {
    const wrapped = new Error("could not save the profile", {
      cause: new DrizzleQueryError(query, params),
    });

    const safe = withoutQueryValues(wrapped);

    expect(safe.message).toBe("could not save the profile");
    expect(safe.stack).toBe(wrapped.stack);
    expect((safe.cause as Error).message).toBe(`Failed query: ${query}`);
    expect(everything(safe)).not.toContain("sigga@example.com");
  });

  it("returns other errors and values as they are", () => {
    const plain = new Error("broken", { cause: new Error("deeper") });
    expect(withoutQueryValues(plain)).toBe(plain);
    expect(withoutQueryValues("text")).toBe("text");
    expect(withoutQueryValues(undefined)).toBeUndefined();
  });
});
