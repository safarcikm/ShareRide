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

  // The API takes a POST, PUT or PATCH only as JSON, so that no form on
  // another page can send one with the person's cookies.
  it("sends an empty JSON body with a change that has none, so the API takes it", async () => {
    const endRoute = defineRoute({
      method: "post",
      path: "/v1/items/{id}/end",
      summary: "End an item",
      tags: ["test"],
      auth: true,
      request: { params: z.object({ id: z.string() }) },
      responses: { 204: { description: "Ended" } },
    });
    const { fetch, sent } = fakeFetch(() => new Response(null, { status: 204 }));
    const client = createApiClient({ baseUrl: "http://api.test", fetch });
    await client.call(endRoute, { params: { id: "1" } });
    expect(sent[0]?.init.method).toBe("POST");
    expect(sent[0]?.init.body).toBe("{}");
    expect(new Headers(sent[0]?.init.headers).get("content-type")).toBe("application/json");
  });

  it("sends no body with a read", async () => {
    const readRoute = defineRoute({
      method: "get",
      path: "/v1/items",
      summary: "The items",
      tags: ["test"],
      responses: { 204: { description: "None" } },
    });
    const { fetch, sent } = fakeFetch(() => new Response(null, { status: 204 }));
    const client = createApiClient({ baseUrl: "http://api.test", fetch });
    await client.call(readRoute, {});
    expect(sent[0]?.init.body).toBeUndefined();
    expect(new Headers(sent[0]?.init.headers).get("content-type")).toBeNull();
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

  it("sends the headers it was made with on every request, under the access token", async () => {
    const { fetch, sent } = fakeFetch(() => new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: "http://api.test",
      fetch,
      headers: { "X-Client-Platform": "ios", accept: "text/plain" },
    });
    await client.call(itemRoute, {
      params: { id: "1" },
      query: {},
      body: { name: "x" },
      accessToken: "token",
    });
    const headers = new Headers(sent[0]?.init.headers);
    expect(headers.get("x-client-platform")).toBe("ios");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer token");
  });
});
