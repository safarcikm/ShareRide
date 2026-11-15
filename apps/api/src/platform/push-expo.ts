import {
  PushMaybeSent,
  type PushMessage,
  type PushReceipt,
  type PushSender,
  type PushTicket,
} from "./push.ts";

// Push through Expo's push service (plan 4.5), which passes each message to
// Apple's or Google's. Plain fetch, no SDK: two endpoints, JSON both ways.

export interface ExpoPushOptions {
  /** Expo's access token, when "enhanced push security" is on for the project. */
  readonly accessToken?: string;
  /** Well within the worker's two-minute lease, so a hung request never holds it. */
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

const sendEndpoint = "https://exp.host/--/api/v2/push/send";
const receiptsEndpoint = "https://exp.host/--/api/v2/push/getReceipts";
/** Expo takes at most this many messages, and this many receipt IDs, per request. */
const messagesPerRequest = 100;
const receiptsPerRequest = 1000;
/** Connection errors that mean the request never left, so nothing was sent. */
const neverConnected = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
]);

function neverLeft(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined;
  const code =
    typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
  return typeof code === "string" && neverConnected.has(code);
}

/**
 * Sends push notifications through Expo. Errors name the HTTP status or
 * the shape only: never a token or a message's text, which Expo may repeat.
 * Only a request that never left, or that Expo refused as a whole, can be
 * tried again; anything else after sending may have reached the phones
 * (`PushMaybeSent`).
 */
export function createExpoPushSender(options: ExpoPushOptions = {}): PushSender {
  const fetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;

  async function post(url: string, body: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          ...(options.accessToken === undefined
            ? {}
            : { authorization: `Bearer ${options.accessToken}` }),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (neverLeft(error)) {
        throw new Error("Expo's push service could not be reached", { cause: error });
      }
      throw new PushMaybeSent("Expo's push service did not answer in time", { cause: error });
    }
    if (!response.ok) {
      throw new Error(`Expo's push service refused the request (HTTP ${String(response.status)})`);
    }
    const answer: unknown = await response.json().catch(() => null);
    if (typeof answer !== "object" || answer === null || !("data" in answer)) {
      throw new PushMaybeSent("Expo's push service gave an answer without data");
    }
    return answer.data;
  }

  return {
    async send(messages) {
      const sendBatch = async (batch: readonly PushMessage[]) => {
        const data = await post(
          sendEndpoint,
          batch.map((message) => ({ ...message, sound: "default", priority: "high" })),
        );
        if (!Array.isArray(data) || data.length !== batch.length) {
          throw new PushMaybeSent("Expo's push service gave a ticket count that does not match");
        }
        return data.map((item: unknown) => ticketOf(item));
      };
      const tickets: PushTicket[] = [];
      for (const batch of batches(messages, messagesPerRequest)) {
        try {
          tickets.push(...(await sendBatch(batch)));
        } catch (error) {
          if (tickets.length === 0) throw error;
          // Earlier batches went out, so this send is never tried again: the
          // rest are lost rather than the first ones sent twice.
          const unsent: PushTicket = { status: "error", code: "unknown" };
          return [...tickets, ...messages.slice(tickets.length).map(() => unsent)];
        }
      }
      return tickets;
    },

    async receipts(ids) {
      const receipts = new Map<string, PushReceipt>();
      for (const batch of batches(ids, receiptsPerRequest)) {
        const data = await post(receiptsEndpoint, { ids: batch });
        if (typeof data !== "object" || data === null) {
          throw new Error("Expo's push service gave receipts out of shape");
        }
        for (const id of batch) {
          const item = (data as Record<string, unknown>)[id];
          if (item === undefined) continue;
          const ticket = ticketOf(item);
          receipts.set(id, ticket.status === "ok" ? { status: "ok" } : ticket);
        }
      }
      return receipts;
    },
  };
}

function batches<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

/**
 * A ticket or receipt from Expo's answer. An error is named by Expo's code
 * when it is a plain word, else `unknown`, so no odd text reaches the logs.
 */
function ticketOf(item: unknown): PushTicket {
  const field = (from: unknown, name: string): unknown =>
    typeof from === "object" && from !== null && name in from
      ? (from as Record<string, unknown>)[name]
      : undefined;
  const status = field(item, "status");
  const id = field(item, "id");
  if (status === "ok") return { status: "ok", id: typeof id === "string" ? id : "" };
  const code = field(field(item, "details"), "error");
  return {
    status: "error",
    code: typeof code === "string" && /^[A-Za-z]{1,40}$/.test(code) ? code : "unknown",
  };
}
