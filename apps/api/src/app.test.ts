import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { createLogger } from "./logger.ts";

function setup(checkDatabase: () => Promise<void> = () => Promise.resolve()) {
  const logLines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logLines.push(chunk.toString());
      callback();
    },
  });
  const app = createApp({ logger: createLogger({ level: "info", destination }), checkDatabase });
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
