import { describe, expect, it } from "vitest";
import { createExpoPushSender } from "./push-expo.ts";
import type { PushMessage } from "./push.ts";

const message = (n: number): PushMessage => ({
  to: `ExponentPushToken[device-${String(n)}]`,
  title: "New request: Jón",
  body: "1 seat · BSÍ – N1 Borgarnes",
  data: { path: "/drive/trips/trip-1" },
});

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

/** A stand-in for fetch that records each request and answers as told. */
function fakeFetch(answer: (body: unknown, call: number) => Response) {
  const calls: Call[] = [];
  const fetch = (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    const body: unknown = JSON.parse(typeof init?.body === "string" ? init.body : "null");
    return Promise.resolve(answer(body, calls.length));
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

/** Expo's answer to a batch: an ok ticket for each message. */
function tickets(body: unknown): Response {
  const sent = body as readonly PushMessage[];
  return Response.json({
    data: sent.map((one) => ({ status: "ok", id: `ticket-${one.to}` })),
  });
}

function bodyOf(call: Call | undefined): string {
  const body = call?.init.body;
  if (typeof body !== "string") throw new Error("expected a JSON body");
  return body;
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected it to fail");
    },
    (caught: unknown) => caught,
  );
}

describe("createExpoPushSender", () => {
  it("posts the messages to Expo's push service as JSON, with the access token when set", async () => {
    const { calls, fetch } = fakeFetch(tickets);
    const answer = await createExpoPushSender({ fetch, accessToken: "expo-test" }).send([
      message(1),
      message(2),
    ]);

    expect(answer).toEqual([
      { status: "ok", id: "ticket-ExponentPushToken[device-1]" },
      { status: "ok", id: "ticket-ExponentPushToken[device-2]" },
    ]);
    const [call] = calls;
    expect(call?.url).toBe("https://exp.host/--/api/v2/push/send");
    expect(call?.init.method).toBe("POST");
    const headers = new Headers(call?.init.headers);
    expect(headers.get("authorization")).toBe("Bearer expo-test");
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(bodyOf(call))).toEqual([
      { ...message(1), sound: "default", priority: "high" },
      { ...message(2), sound: "default", priority: "high" },
    ]);
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);

    const { calls: without, fetch: plain } = fakeFetch(tickets);
    await createExpoPushSender({ fetch: plain }).send([message(1)]);
    expect(new Headers(without[0]?.init.headers).has("authorization")).toBe(false);
  });

  it("sends more than 100 messages in batches of 100, and keeps the tickets in order", async () => {
    const { calls, fetch } = fakeFetch(tickets);
    const many = Array.from({ length: 205 }, (_, n) => message(n));
    const answer = await createExpoPushSender({ fetch }).send(many);
    expect(calls.map((call) => (JSON.parse(bodyOf(call)) as unknown[]).length)).toEqual([
      100, 100, 5,
    ]);
    expect(answer.map((ticket) => (ticket.status === "ok" ? ticket.id : ""))).toEqual(
      many.map((one) => `ticket-${one.to}`),
    );
  });

  it("names a refused message by Expo's error, and anything odd as unknown", async () => {
    const { fetch } = fakeFetch(() =>
      Response.json({
        data: [
          {
            status: "error",
            message: "not a valid token",
            details: { error: "DeviceNotRegistered" },
          },
          { status: "error", message: "ExponentPushToken[device-2] is odd" },
          { status: "error", details: { error: "Odd <script>" } },
        ],
      }),
    );
    expect(
      await createExpoPushSender({ fetch }).send([message(1), message(2), message(3)]),
    ).toEqual([
      { status: "error", code: "DeviceNotRegistered" },
      { status: "error", code: "unknown" },
      { status: "error", code: "unknown" },
    ]);
  });

  it("throws, without the text or the tokens, when Expo cannot be reached, refuses the batch or answers out of shape", async () => {
    const answers: (() => Response)[] = [
      () => {
        throw new TypeError("fetch failed");
      },
      () => new Response(`Too many requests for ${message(1).to}`, { status: 429 }),
      () => Response.json({ data: [] }),
      () => new Response("not JSON"),
      () => Response.json({ errors: [{ code: "PUSH_TOO_MANY_EXPERIENCE_IDS" }] }),
    ];
    for (const answer of answers) {
      const { fetch } = fakeFetch(answer);
      const error = await failure(createExpoPushSender({ fetch }).send([message(1)]));
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain("device-1");
      expect(String(error)).not.toContain("Jón");
    }
  });

  it("gives the receipts by ticket, asking for at most 1000 at a time", async () => {
    const { calls, fetch } = fakeFetch((body) => {
      const { ids } = body as { ids: string[] };
      return Response.json({
        data: Object.fromEntries(
          ids
            .filter((id) => id !== "ticket-7")
            .map((id) => [
              id,
              id === "ticket-3"
                ? { status: "error", details: { error: "DeviceNotRegistered" } }
                : { status: "ok" },
            ]),
        ),
      });
    });
    const ids = Array.from({ length: 1001 }, (_, n) => `ticket-${String(n)}`);
    const receipts = await createExpoPushSender({ fetch }).receipts(ids);

    expect(calls.map((call) => call.url)).toEqual([
      "https://exp.host/--/api/v2/push/getReceipts",
      "https://exp.host/--/api/v2/push/getReceipts",
    ]);
    expect(calls.map((call) => (JSON.parse(bodyOf(call)) as { ids: string[] }).ids.length)).toEqual(
      [1000, 1],
    );
    expect(receipts.get("ticket-1")).toEqual({ status: "ok" });
    expect(receipts.get("ticket-3")).toEqual({ status: "error", code: "DeviceNotRegistered" });
    // Not ready yet.
    expect(receipts.has("ticket-7")).toBe(false);
    expect(receipts.size).toBe(1000);
    expect(await createExpoPushSender({ fetch }).receipts([])).toEqual(new Map());
  });
});
