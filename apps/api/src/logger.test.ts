import { Writable } from "node:stream";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.ts";

function capture() {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    },
  });
  return { lines, destination };
}

describe("createLogger", () => {
  it("writes JSON lines with the level as a word and an ISO time", () => {
    const { lines, destination } = capture();
    createLogger({ level: "info", destination }).info({ requestId: "r1" }, "hello");
    expect(lines[0]).toMatchObject({ level: "info", msg: "hello", requestId: "r1" });
    expect(String(lines[0]?.["time"])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("redacts phone numbers, codes, tokens and other personal data at any depth", () => {
    const { lines, destination } = capture();
    createLogger({ level: "info", destination }).info(
      {
        phone: "+3545551234",
        body: { phoneE164: "+3545551234", code: "123456" },
        session: { tokens: { refreshToken: "abc", accessToken: "def" } },
        headers: { authorization: "Bearer abc", cookie: "refresh=abc" },
        user: { email: "someone@example.com", firstName: "Anna" },
      },
      "signed in",
    );
    const line = JSON.stringify(lines[0]);
    for (const secret of ["+3545551234", "123456", "abc", "def", "someone@example.com", "Anna"]) {
      expect(line).not.toContain(secret);
    }
    expect(line).toContain("[redacted]");
  });

  it("keeps error codes when logged as errorCode", () => {
    const { lines, destination } = capture();
    createLogger({ level: "info", destination }).warn({ errorCode: "code_invalid" }, "failed");
    expect(lines[0]).toMatchObject({ errorCode: "code_invalid" });
  });

  it("logs a failed query without its values", () => {
    const { lines, destination } = capture();
    const failed = new DrizzleQueryError(
      'update "users" set "first_name" = $1, "email" = $2',
      ["Sigríður", "sigga@example.com"],
      new Error("connection lost"),
    );
    createLogger({ level: "info", destination }).error({ err: failed }, "unhandled error");
    const line = JSON.stringify(lines[0]);
    expect(line).toContain('Failed query: update \\"users\\"');
    expect(line).toContain("connection lost");
    expect(line).not.toContain("Sigríður");
    expect(line).not.toContain("sigga@example.com");
  });
});
