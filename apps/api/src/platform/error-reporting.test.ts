import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import * as Sentry from "@sentry/node";
import { DrizzleQueryError } from "drizzle-orm/errors";
import pg from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { captureError, startErrorReporting } from "./error-reporting.ts";

/** Collects what would be sent to Sentry, as text. */
function fakeTransport(sent: string[]) {
  return (options: Parameters<typeof Sentry.createTransport>[0]) =>
    Sentry.createTransport(options, (request) => {
      sent.push(
        typeof request.body === "string" ? request.body : new TextDecoder().decode(request.body),
      );
      return Promise.resolve({ statusCode: 200 });
    });
}

const dsn = "https://public@o1.ingest.de.sentry.io/1";

/** The events among the sent envelopes (an envelope is a header, then item header and payload pairs). */
function events(sent: string[]): Record<string, unknown>[] {
  return sent.flatMap((envelope) => {
    const lines = envelope.split("\n").slice(1);
    const found: Record<string, unknown>[] = [];
    for (let index = 0; index + 1 < lines.length; index += 2) {
      const header = JSON.parse(lines[index] ?? "{}") as { type?: string };
      if (header.type === "event")
        found.push(JSON.parse(lines[index + 1] ?? "{}") as Record<string, unknown>);
    }
    return found;
  });
}

afterEach(async () => {
  await Sentry.close();
});

describe("startErrorReporting", () => {
  it("does nothing without a DSN", () => {
    const before = Sentry.getClient();
    const report = startErrorReporting({
      dsn: undefined,
      environment: "local",
      release: undefined,
    });
    expect(report).toBeUndefined();
    expect(Sentry.getClient()).toBe(before);
  });

  it("sends errors with the route and release, and without phone numbers, codes or tokens", async () => {
    const sent: string[] = [];
    const report = startErrorReporting({
      dsn,
      environment: "staging",
      release: "abc1234",
      transport: fakeTransport(sent),
    });
    Sentry.addBreadcrumb({
      message: "SMS to +3546901234 failed",
      data: { phoneNumber: "+3546901234" },
    });

    report?.(new Error("No session for sr_rt_c2VjcmV0 and code 482913 to 690 1234"), {
      method: "POST",
      route: "/v1/auth/refresh",
      requestId: "r-1",
    });
    await Sentry.flush(2000);

    const text = sent.join("\n");
    expect(events(sent)).toHaveLength(1);
    expect(text).toContain("/v1/auth/refresh");
    expect(text).toContain('"release":"abc1234"');
    expect(text).toContain('"environment":"staging"');
    expect(text).toContain("No session for [token] and code [code] to [number]");
    for (const secret of ["3546901234", "482913", "690 1234", "sr_rt_c2VjcmV0"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("drops request bodies, cookies and all but a few headers", async () => {
    const sent: string[] = [];
    startErrorReporting({
      dsn,
      environment: "staging",
      release: undefined,
      transport: fakeTransport(sent),
    });
    Sentry.captureEvent({
      message: "with a request",
      request: {
        method: "POST",
        url: "https://staging.example/v1/auth/phone/verify?phone=%2B3546901234",
        headers: {
          authorization: "Bearer x",
          cookie: "sr_refresh=y",
          "user-agent": "Test",
          "x-forwarded-for": "203.0.113.5",
        },
        cookies: { sr_refresh: "y" },
        data: { phoneNumber: "+3546901234", code: "482913" },
        query_string: "to=me",
      },
      user: { id: "u-1", ip_address: "203.0.113.5", email: "someone@example.com" },
    });
    await Sentry.flush(2000);

    const [event] = events(sent);
    expect(event?.["request"]).toEqual({
      method: "POST",
      url: "https://staging.example/v1/auth/phone/verify",
      headers: { "user-agent": "Test" },
    });
    expect(event?.["user"]).toEqual({ id: "u-1" });
    expect(sent.join("\n")).not.toContain("203.0.113.5");
  });

  it("sends a failed query without the values it was given", async () => {
    const sent: string[] = [];
    const report = startErrorReporting({
      dsn,
      environment: "staging",
      release: undefined,
      transport: fakeTransport(sent),
    });

    report?.(failedQuery(), { method: "PATCH", route: "/v1/me", requestId: "r-2" });
    await Sentry.flush(2000);

    const text = sent.join("\n");
    expect(events(sent)).toHaveLength(1);
    expect(text).toContain("Failed query: update");
    expect(text).toContain("users_email_key");
    // Removed before sending, not only hidden on the way out.
    expect(text).not.toContain("params:");
    for (const value of personalValues) expect(text).not.toContain(value);
  });

  it("hides a failed query's values when the SDK catches it by itself", async () => {
    const sent: string[] = [];
    startErrorReporting({
      dsn,
      environment: "staging",
      release: undefined,
      transport: fakeTransport(sent),
    });

    // As the handlers for uncaught errors do, without captureError.
    Sentry.captureException(failedQuery());
    await Sentry.flush(2000);

    const text = sent.join("\n");
    expect(events(sent)).toHaveLength(1);
    for (const value of personalValues) expect(text).not.toContain(value);
  });

  it("tags errors from commands", async () => {
    const sent: string[] = [];
    startErrorReporting({
      dsn,
      environment: "staging",
      release: undefined,
      transport: fakeTransport(sent),
    });

    captureError(new Error("clean-up broke"), { job: "clean-up" });
    await Sentry.flush(2000);

    expect(events(sent)[0]).toMatchObject({ tags: { job: "clean-up" } });
  });

  it("adds no trace headers to the API's own requests, such as those to 46elks", async () => {
    const received: IncomingHttpHeaders[] = [];
    const server = createServer((request, response) => {
      received.push(request.headers);
      response.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    startErrorReporting({
      dsn,
      environment: "staging",
      release: "abc1234",
      transport: fakeTransport([]),
    });

    try {
      await (await fetch(`http://127.0.0.1:${String(port)}/a1/sms`)).text();
    } finally {
      server.close();
    }

    expect(received).toHaveLength(1);
    expect(received[0]).not.toHaveProperty("sentry-trace");
    expect(received[0]).not.toHaveProperty("baggage");
    expect(received[0]).not.toHaveProperty("traceparent");
  });
});

// Built from parts, because reports carry lines of the source around each
// frame, and this file's source must not hold the values the test looks for.
const name = ["Sig", "ríður"].join("");
const email = ["sigga", "example.com"].join("@");
const personalValues = [name, email];

function failedQuery(): DrizzleQueryError {
  const cause = new pg.DatabaseError(
    'duplicate key value violates unique constraint "users_email_key"',
    0,
    "error",
  );
  cause.code = "23505";
  cause.constraint = "users_email_key";
  cause.detail = `Key (email)=(${email}) already exists.`;
  return new DrizzleQueryError(
    'update "users" set "first_name" = $1, "email" = $2',
    [name, email],
    cause,
  );
}
