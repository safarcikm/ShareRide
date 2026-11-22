// Email through an email provider: Mailjet (ADR 0027, email-mailjet.ts),
// or the development outbox (email-dev.ts). The worker calls the port; the
// fake records what it was given.
import { MaybeSent } from "./maybe-sent.ts";

/** A picture inside an email, which its HTML shows as `cid:<contentId>` (spec 24, 3.4). */
export interface EmailImage {
  readonly contentId: string;
  readonly filename: string;
  readonly contentType: "image/png";
  readonly content: Uint8Array;
}

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  /** The plain text part. */
  readonly text: string;
  /** The same words in the PuffinRide layout: nothing loaded from elsewhere, no tracking. */
  readonly html: string;
  /** The pictures the HTML shows, sent inside the email. */
  readonly images?: readonly EmailImage[];
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

/** The email the API sends, and the web app its links open. */
export interface EmailChannel {
  readonly sender: EmailSender;
  /** The web app's origin, such as `https://shareride.is`. */
  readonly webAppUrl: string;
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
