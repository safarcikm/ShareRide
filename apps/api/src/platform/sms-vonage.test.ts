import { describe, expect, it } from "vitest";
import { createVonageSmsSender } from "./sms-vonage.ts";
import { SmsSendError } from "./sms.ts";

const number = "+3546912345";
const message = { to: number, text: "123456 er kóðinn þinn hjá ShareRide." };

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

/** A stand-in for fetch that records the request and answers as told. */
function fakeFetch(answer: () => Promise<Response>) {
  const calls: Call[] = [];
  // The sender always passes the URL as a string.
  const fetch = (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return answer();
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

/** The form fields of a recorded request. */
function form(call: Call | undefined): Record<string, string> {
  const body = call?.init.body;
  if (typeof body !== "string") throw new Error("expected a form body");
  return Object.fromEntries(new URLSearchParams(body));
}

/** Vonage's answer: one entry per SMS part, status "0" when accepted. */
const answer =
  (...statuses: string[]) =>
  () =>
    Promise.resolve(
      Response.json({
        "message-count": String(statuses.length),
        messages: statuses.map((status) => ({
          to: number.slice(1),
          status,
          ...(status === "0" ? { "message-id": "m-1" } : { "error-text": `Rejected ${number}` }),
        })),
      }),
    );

function sender(fetch: typeof globalThis.fetch, extra: { timeoutMs?: number } = {}) {
  return createVonageSmsSender({
    apiKey: "k-test",
    apiSecret: "s-test",
    sender: "ShareRide",
    fetch,
    ...extra,
  });
}

/** The error a send ends with. */
async function failure(promise: Promise<void>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected the send to fail");
    },
    (caught: unknown) => caught,
  );
}

describe("createVonageSmsSender", () => {
  it("posts a form to Vonage's EU endpoint with basic auth", async () => {
    const { calls, fetch } = fakeFetch(answer("0"));
    await sender(fetch).send(message);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://api-eu.vonage.com/sms/json");
    expect(call?.init.method).toBe("POST");
    const headers = new Headers(call?.init.headers);
    expect(headers.get("authorization")).toBe(`Basic ${btoa("k-test:s-test")}`);
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    // Vonage takes the number without its +, and Icelandic letters need unicode.
    expect(form(call)).toEqual({
      from: "ShareRide",
      to: "3546912345",
      text: message.text,
      type: "unicode",
    });
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws when Vonage does not accept every part, naming the status but not the number", async () => {
    const { fetch } = fakeFetch(answer("0", "29"));
    const error = await failure(sender(fetch).send(message));
    expect(error).toBeInstanceOf(SmsSendError);
    expect(String(error)).toContain("status 29");
    expect(String(error)).toContain("not verified on a trial account");
    expect(String(error)).not.toContain("354");
  });

  it("names a status it does not know by its number only", async () => {
    const { fetch } = fakeFetch(answer("99"));
    const error = await failure(sender(fetch).send(message));
    expect(String(error)).toContain("status 99");
    expect(String(error)).not.toContain("354");
  });

  it("accepts a status sent as a number", async () => {
    const { fetch } = fakeFetch(() =>
      Promise.resolve(Response.json({ "message-count": "1", messages: [{ status: 0 }] })),
    );
    await expect(sender(fetch).send(message)).resolves.toBeUndefined();
  });

  it("refuses a part without a status, and keeps odd status text out of the error", async () => {
    for (const part of [{}, { status: `invalid ${number}` }]) {
      const { fetch } = fakeFetch(() =>
        Promise.resolve(Response.json({ "message-count": "1", messages: [part] })),
      );
      const error = await failure(sender(fetch).send(message));
      expect(error).toBeInstanceOf(SmsSendError);
      expect(String(error)).toContain("status unexpected");
      expect(String(error)).not.toContain("354");
    }
  });

  it("never puts the code or the secret in an error", async () => {
    const { fetch } = fakeFetch(answer("4"));
    const error = await failure(sender(fetch).send(message));
    expect(String(error)).not.toContain("123456");
    expect(String(error)).not.toContain("s-test");
  });

  it("throws when Vonage refuses the request or the answer makes no sense", async () => {
    for (const response of [
      new Response(`Bad request for ${number}`, { status: 401 }),
      Response.json({ "message-count": "0", messages: [] }),
      new Response("not JSON"),
    ]) {
      const { fetch } = fakeFetch(() => Promise.resolve(response));
      const error = await failure(sender(fetch).send(message));
      expect(error).toBeInstanceOf(SmsSendError);
      expect(String(error)).not.toContain("354");
    }
  });

  it("throws when Vonage cannot be reached or does not answer in time", async () => {
    const { fetch } = fakeFetch(() =>
      Promise.reject(new DOMException("The operation timed out.", "TimeoutError")),
    );
    await expect(sender(fetch).send(message)).rejects.toThrow(SmsSendError);
  });

  it("gives up after the timeout", async () => {
    const fetch = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason as Error);
        });
      })) as typeof globalThis.fetch;
    await expect(sender(fetch, { timeoutMs: 20 }).send(message)).rejects.toThrow(SmsSendError);
  });
});
