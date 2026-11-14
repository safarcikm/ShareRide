import { Writable } from "node:stream";
import { validator } from "hono/validator";
import { describe, expect, it } from "vitest";
import { createApp, type ErrorReporter } from "./app.ts";
import { createLogger } from "./logger.ts";

function setup(
  checkDatabase: () => Promise<void> = () => Promise.resolve(),
  reportError?: ErrorReporter,
) {
  const logLines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logLines.push(chunk.toString());
      callback();
    },
  });
  const app = createApp({
    logger: createLogger({ level: "info", destination }),
    checkDatabase,
    ...(reportError === undefined ? {} : { reportError }),
  });
  return { app, logLines };
}

describe("health", () => {
  it("GET /v1/health answers ok", async () => {
    const response = await setup().app.request("/v1/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("GET /v1/health/ready answers ok when the database answers", async () => {
    const response = await setup().app.request("/v1/health/ready");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("GET /v1/health/ready answers 503 when the database does not", async () => {
    const { app } = setup(() => Promise.reject(new Error("connection refused")));
    const response = await app.request("/v1/health/ready");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});

describe("errors", () => {
  it("an unknown path gets 404 with the standard error shape", async () => {
    const response = await setup().app.request("/v1/no-such-thing");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: expect.any(String) as string },
    });
  });
});

describe("unexpected errors", () => {
  it("answer 500 and are reported with the route pattern, method and request ID", async () => {
    const reported: { error: unknown; context: unknown }[] = [];
    const { app, logLines } = setup(undefined, (error, context) => {
      reported.push({ error, context });
    });
    app.get("/v1/test/:id/fails", () => {
      throw new Error("broken");
    });

    const response = await app.request("/v1/test/42/fails");

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: "internal_error" } });
    expect(reported).toEqual([
      {
        error: new Error("broken"),
        context: {
          method: "GET",
          route: "/v1/test/:id/fails",
          requestId: response.headers.get("x-request-id"),
        },
      },
    ]);
    expect(logLines.some((line) => line.includes("unhandled error"))).toBe(true);
  });

  it("do not include a request the client got wrong, such as JSON that does not parse", async () => {
    const reported: unknown[] = [];
    const { app, logLines } = setup(undefined, (error) => {
      reported.push(error);
    });
    app.post(
      "/v1/test/echo",
      validator("json", (value: unknown) => value),
      (c) => c.json({}),
    );

    const response = await app.request("/v1/test/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"phoneNumber": "+354 690',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "validation_failed", message: "The request is not valid." },
    });
    expect(reported).toEqual([]);
    expect(logLines.some((line) => line.includes("unhandled error"))).toBe(false);
  });
});

describe("request bodies", () => {
  it("must be JSON, so a cross-site form cannot post to the API", async () => {
    const response = await setup().app.request("/v1/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "refreshToken=x",
    });
    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ error: { code: "unsupported_media_type" } });
  });

  it("may be JSON with a charset", async () => {
    const response = await setup().app.request("/v1/no-such-thing", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: "{}",
    });
    expect(response.status).toBe(404);
  });
});

describe("requests", () => {
  it("every response carries a request ID, which is also in the log line", async () => {
    const { app, logLines } = setup();
    const response = await app.request("/v1/health");
    const requestId = response.headers.get("x-request-id");
    expect(requestId).toBeTruthy();
    const line = JSON.parse(logLines.at(-1) ?? "{}") as Record<string, unknown>;
    expect(line).toMatchObject({ requestId, method: "GET", route: "/v1/health", status: 200 });
  });

  it("does not log query strings, which could hold personal data", async () => {
    const { app, logLines } = setup();
    await app.request("/v1/health?phone=%2B3545551234");
    expect(logLines.join("")).not.toContain("3545551234");
  });

  it("sends security headers", async () => {
    const response = await setup().app.request("/v1/health");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=");
  });
});

describe("OpenAPI", () => {
  it("GET /v1/openapi.json documents the health routes", async () => {
    const response = await setup().app.request("/v1/openapi.json");
    expect(response.status).toBe(200);
    const document = (await response.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(document.openapi).toMatch(/^3\.1/);
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(["/v1/health", "/v1/health/ready"]),
    );
  });
});
