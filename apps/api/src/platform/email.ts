// Email through an email provider: Mailjet (ADR 0027, email-mailjet.ts),
// or the development outbox (email-dev.ts). The worker calls the port; the
// fake records what it was given.
import { MaybeSent } from "./maybe-sent.ts";

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  /** The plain text part. */
  readonly text: string;
  /** The same words as simple HTML: no images, no tracking. */
  readonly html: string;
  /**
   * The same for every attempt at one delivery. Mailjet keeps it with the
   * message (`CustomID`), so a delivery can be found in its logs; it does
   * not stop a second send.
   */
  readonly idempotencyKey: string;
}

/** An email whose answer was lost after the provider may have taken it. */
export class EmailMaybeSent extends MaybeSent {
  override readonly name = "EmailMaybeSent";
}

export interface EmailSender {
  /**
   * Resolves with the provider's ID once it has accepted the message.
   * Throws `EmailMaybeSent` when it may have been sent anyway, and any
   * other error when it was not, so the worker may try again.
   */
  send(message: EmailMessage): Promise<{ readonly id: string }>;
}

export interface FakeEmailSender extends EmailSender {
  /** What was sent, oldest first. */
  readonly sent: EmailMessage[];
  /** While set, each send throws it instead. */
  failure: Error | null;
}

/** For tests: records each message. */
export function createFakeEmailSender(): FakeEmailSender {
  const fake: FakeEmailSender = {
    sent: [],
    failure: null,
    send(message) {
      if (fake.failure !== null) return Promise.reject(fake.failure);
      fake.sent.push(message);
      return Promise.resolve({ id: `email-${String(fake.sent.length)}` });
    },
  };
  return fake;
}
