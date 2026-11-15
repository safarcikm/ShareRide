// Email through an email provider: Mailjet from PR 7 (decision 3). Until
// then the API has no sender and the worker skips email (`email_off`).

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  /** The same for every attempt at one delivery, so the provider sends it once. */
  readonly idempotencyKey: string;
}

export interface EmailSender {
  /** Resolves with the provider's ID once it has accepted the message; throws otherwise. */
  send(message: EmailMessage): Promise<{ readonly id: string }>;
}

export interface FakeEmailSender extends EmailSender {
  /** What was sent, oldest first. */
  readonly sent: EmailMessage[];
}

/** For tests: records each message. */
export function createFakeEmailSender(): FakeEmailSender {
  const fake: FakeEmailSender = {
    sent: [],
    send(message) {
      fake.sent.push(message);
      return Promise.resolve({ id: `email-${String(fake.sent.length)}` });
    },
  };
  return fake;
}
