// Push notifications through a push service: Expo's (plan 4.5,
// push-expo.ts). The worker calls the port; the fake records what it was
// given.
import { MaybeSent } from "./maybe-sent.ts";

export interface PushMessage {
  /** An Expo push token. */
  readonly to: string;
  readonly title: string;
  readonly body: string;
  /** Where a tap leads in the app, such as `/bookings/…`. */
  readonly data: { readonly path: string };
}

/**
 * The push service's answer for one message: its ticket, or why it refused
 * it, such as `DeviceNotRegistered` for a token that no longer works.
 */
export type PushTicket =
  | { readonly status: "ok"; readonly id: string }
  | { readonly status: "error"; readonly code: string };

/** What came of a ticket once the phone's own push service had it. */
export type PushReceipt =
  { readonly status: "ok" } | { readonly status: "error"; readonly code: string };

/** The error code of a token that no longer works: it is removed. */
export const deviceNotRegistered = "DeviceNotRegistered";

/** A push whose answer was lost after the push service may have taken it. */
export class PushMaybeSent extends MaybeSent {
  override readonly name = "PushMaybeSent";
}

export interface PushSender {
  /**
   * One ticket per message, in the same order. Throws `PushMaybeSent` when
   * the messages may have gone out, and any other error when they cannot
   * have (the push service unreachable, or refusing the whole request); the
   * worker tries only those again.
   */
  send(messages: readonly PushMessage[]): Promise<readonly PushTicket[]>;
  /** The receipts of tickets, by ticket ID; one not ready yet is missing. */
  receipts(ids: readonly string[]): Promise<ReadonlyMap<string, PushReceipt>>;
}

export interface FakePushSender extends PushSender {
  /** What was sent, oldest first. */
  readonly sent: PushMessage[];
  /** How many times `send` was called, failed ones included. */
  readonly attempts: number;
  /** While set, each send fails with it and sends nothing. */
  failure: Error | null;
  /** While set, each request for receipts fails with it. */
  receiptsFailure: Error | null;
  /** Run during each send, before the answer, as if it took a while. */
  whileSending: (() => Promise<unknown>) | null;
  /** Tokens the service refuses, with the error code; nothing is sent to them. */
  readonly refused: Map<string, string>;
  /** The receipts the service gives, by ticket ID. */
  readonly receiptsGiven: Map<string, PushReceipt>;
  /** The ticket IDs asked about, per call. */
  readonly checked: (readonly string[])[];
}

/** For tests: records each message and gives it a ticket. */
export function createFakePushSender(): FakePushSender {
  let attempts = 0;
  let tickets = 0;
  const fake: FakePushSender = {
    sent: [],
    get attempts() {
      return attempts;
    },
    failure: null,
    receiptsFailure: null,
    whileSending: null,
    refused: new Map(),
    receiptsGiven: new Map(),
    checked: [],
    async send(messages) {
      attempts += 1;
      if (fake.failure !== null) throw fake.failure;
      if (fake.whileSending !== null) await fake.whileSending();
      return messages.map((message): PushTicket => {
        const code = fake.refused.get(message.to);
        if (code !== undefined) return { status: "error", code };
        fake.sent.push(message);
        tickets += 1;
        return { status: "ok", id: `ticket-${String(tickets)}` };
      });
    },
    receipts(ids) {
      fake.checked.push([...ids]);
      if (fake.receiptsFailure !== null) return Promise.reject(fake.receiptsFailure);
      return Promise.resolve(
        new Map(
          ids.flatMap((id) => {
            const receipt = fake.receiptsGiven.get(id);
            return receipt === undefined ? [] : [[id, receipt] as const];
          }),
        ),
      );
    },
  };
  return fake;
}
