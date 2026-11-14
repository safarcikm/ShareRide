import { describe, expect, it } from "vitest";
import { createElksSmsSender } from "./sms-46elks.ts";
import { SmsSendError } from "./sms.ts";

const number = "+3546912345";
const message = { to: number, text: "123456 is your ShareRide code." };

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

const sent = () => Promise.resolve(Response.json({ id: "s1", status: "created", parts: 1 }));

function sender(fetch: typeof globalThis.fetch, extra: { dryRun?: boolean } = {}) {
  return createElksSmsSender({
    username: "u-test",
    password: "p-test",
    sender: "ShareRide",
    fetch,
    ...extra,
  });
}

describe("createElksSmsSender", () => {
  it("posts a form to 46elks with basic auth and without keeping the text", async () => {
    const { calls, fetch } = fakeFetch(sent);
    await sender(fetch).send(message);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://api.46elks.com/a1/sms");
    expect(call?.init.method).toBe("POST");
    const headers = new Headers(call?.init.headers);
    expect(headers.get("authorization")).toBe(`Basic ${btoa("u-test:p-test")}`);
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(form(call)).toEqual({
      from: "ShareRide",
      to: number,
      message: message.text,
      dontlog: "message",
    });
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("asks for a dry run when told to, so nothing is sent", async () => {
    const { calls, fetch } = fakeFetch(() =>
      Promise.resolve(Response.json({ status: "created", estimated_cost: 6000, parts: 1 })),
    );
    await sender(fetch, { dryRun: true }).send(message);
    expect(form(calls[0]).dryrun).toBe("yes");
  });

  it("throws when 46elks refuses, without the number in the error", async () => {
    const { fetch } = fakeFetch(() =>
      Promise.resolve(new Response(`Invalid to number ${number}`, { status: 400 })),
    );
    const error = await sender(fetch)
      .send(message)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SmsSendError);
    expect(String(error)).toContain("400");
    expect(String(error)).not.toContain("354");
  });

  it("throws when 46elks answers that the message failed", async () => {
    const { fetch } = fakeFetch(() =>
      Promise.resolve(Response.json({ id: "s1", status: "failed", to: number })),
    );
    const error = await sender(fetch)
      .send(message)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SmsSendError);
    expect(String(error)).not.toContain("354");
  });

  it("throws when 46elks cannot be reached or does not answer in time", async () => {
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
    const slow = createElksSmsSender({
      username: "u-test",
      password: "p-test",
      sender: "ShareRide",
      fetch,
      timeoutMs: 20,
    });
    await expect(slow.send(message)).rejects.toThrow(SmsSendError);
  });
});
