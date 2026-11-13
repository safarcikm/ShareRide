import { defineRoute, errorResponseSchema } from "@shareride/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createApiClient } from "./client.ts";

const itemRoute = defineRoute({
  method: "patch",
  path: "/v1/items/{id}",
  summary: "Change an item",
  tags: ["test"],
  auth: true,
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({ locale: z.enum(["is", "en"]).optional() }),
    body: z.object({ name: z.string() }),
  },
  responses: {
    200: { description: "Changed", schema: z.object({ id: z.string(), name: z.string() }) },
    204: { description: "Nothing to change" },
    400: { description: "Invalid", schema: errorResponseSchema },
  },
});

interface Sent {
  url: string;
  init: RequestInit;
}

function fakeFetch(response: () => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const fetch = (input: string, init: RequestInit) => {
    sent.push({ url: input, init });
    return Promise.resolve(response());
  };
  return { fetch, sent };
}

const json = (body: unknown, status: number) => Response.json(body, { status });

describe("createApiClient().call", () => {
  it("sends the path parameters, query, JSON body and access token", async () => {
    const { fetch, sent } = fakeFetch(() => json({ id: "a b", name: "Selfoss" }, 200));
    const client = createApiClient({ baseUrl: "http://api.test/", fetch });

    const result = await client.call(itemRoute, {
      params: { id: "a b" },
      query: { locale: "is" },
      body: { name: "Selfoss" },
      accessToken: "token-1",
    });

    expect(result).toEqual({ ok: true, status: 200, data: { id: "a b", name: "Selfoss" } });
    expect(sent[0]?.url).toBe("http://api.test/v1/items/a%20b?locale=is");
    expect(sent[0]?.init.method).toBe("PATCH");
    expect(sent[0]?.init.body).toBe('{"name":"Selfoss"}');
    const headers = new Headers(sent[0]?.init.headers);
    expect(headers.get("authorization")).toBe("Bearer token-1");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("leaves out empty query parameters", async () => {
    const { fetch, sent } = fakeFetch(() => new Response(null, { status: 204 }));
    const client = createApiClient({ baseUrl: "http://api.test", fetch });
    await client.call(itemRoute, { params: { id: "1" }, query: {}, body: { name: "x" } });
    expect(sent[0]?.url).toBe("http://api.test/v1/items/1");
  });

  it("returns no data for 204", async () => {
    const { fetch } = fakeFetch(() => new Response(null, { status: 204 }));
    const client = createApiClient({ baseUrl: "http://api.test", fetch });
    const result = await client.call(itemRoute, {
      params: { id: "1" },
      query: {},
      body: { name: "x" },
    });
    expect(result).toEqual({ ok: true, status: 204, data: undefined });
  });

  it("returns the API's error", async () => {
    const error = { code: "profile_invalid", message: "No.", attemptsLeft: 2 };
    const { fetch } = fakeFetch(() => json({ error }, 400));
    const client = createApiClient({ baseUrl: "http://api.test", fetch });
    const result = await client.call(itemRoute, {
      params: { id: "1" },
      query: {},
      body: { name: "x" },
    });
    expect(result).toEqual({ ok: false, status: 400, error });
  });

  it("reports a network failure as an error with status 0", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test",
      fetch: () => Promise.reject(new TypeError("Network request failed")),
    });
    const result = await client.call(itemRoute, {
      params: { id: "1" },
      query: {},
      body: { name: "x" },
    });
    expect(result).toMatchObject({ ok: false, status: 0, error: { code: "network_error" } });
  });

  it("refuses a reply that does not match the contract", async () => {
    const { fetch } = fakeFetch(() => json({ id: 1 }, 200));
    const client = createApiClient({ baseUrl: "http://api.test", fetch });
    const result = await client.call(itemRoute, {
      params: { id: "1" },
      query: {},
      body: { name: "x" },
    });
    expect(result).toMatchObject({
      ok: false,
      status: 200,
      error: { code: "unexpected_response" },
    });
  });

  it("sends cookies when asked, for the web's refresh cookie", async () => {
    const { fetch, sent } = fakeFetch(() => new Response(null, { status: 204 }));
    const client = createApiClient({ baseUrl: "http://api.test", fetch, credentials: "include" });
    await client.call(itemRoute, { params: { id: "1" }, query: {}, body: { name: "x" } });
    expect(sent[0]?.init.credentials).toBe("include");
  });
});
