// Push notifications through a push service: Expo's from PR 6 (plan 4.5).
// The worker calls the port; the fake records what it was given.

export interface PushMessage {
  /** An Expo push token. */
  readonly to: string;
  readonly title: string;
  readonly body: string;
  /** Where a tap leads in the app, such as `/bookings/…`. */
  readonly data: { readonly path: string };
}

/** The push service's answer for one message: its ticket, or why it refused it. */
export type PushTicket =
  | { readonly status: "ok"; readonly id: string }
  | { readonly status: "error"; readonly code: string };

export interface PushSender {
  /**
   * One ticket per message, in the same order. Throws when the push service
   * could not be reached or refused the whole batch; the worker tries again.
   */
  send(messages: readonly PushMessage[]): Promise<readonly PushTicket[]>;
}

export interface FakePushSender extends PushSender {
  /** What was sent, oldest first. */
  readonly sent: PushMessage[];
  /** How many times `send` was called, failed ones included. */
  readonly attempts: number;
  /** While set, each send fails with it and sends nothing. */
  failure: Error | null;
}

/** For tests: records each message and gives it a ticket. */
export function createFakePushSender(): FakePushSender {
  let attempts = 0;
  const fake: FakePushSender = {
    sent: [],
    get attempts() {
      return attempts;
    },
    failure: null,
    send(messages) {
      attempts += 1;
      if (fake.failure !== null) return Promise.reject(fake.failure);
      fake.sent.push(...messages);
      return Promise.resolve(
        messages.map((_, index) => ({
          status: "ok" as const,
          id: `ticket-${String(fake.sent.length - messages.length + index + 1)}`,
        })),
      );
    },
  };
  return fake;
}

/**
 * Until the Expo adapter (PR 6): nothing can register a push token yet, so
 * this is never called. If it were, it reports the count, never the text.
 */
export function createUnconnectedPushSender(log: (count: number) => void): PushSender {
  return {
    send(messages) {
      log(messages.length);
      return Promise.resolve(messages.map(() => ({ status: "error", code: "NotConnected" })));
    },
  };
}
