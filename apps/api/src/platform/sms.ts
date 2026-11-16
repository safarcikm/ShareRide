export interface SmsMessage {
  /** E.164. */
  readonly to: string;
  readonly text: string;
}

/**
 * Sends text messages: Vonage in staging and production, 46elks as the
 * fallback (ADR 0023), the development sender locally and in tests.
 */
export interface SmsSender {
  /** Resolves once the provider has accepted the message; throws `SmsSendError` otherwise. */
  send(message: SmsMessage): Promise<void>;
}

/** A message was not sent. The text never contains the phone number. */
export class SmsSendError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SmsSendError";
  }
}

/**
 * The provider may have taken the message before its answer was lost: a
 * timeout or dropped connection after sending, a server error that can come
 * after taking it, an answer out of shape, or a message taken only in part.
 * The notification worker never sends it again (R7.6); a person waiting for
 * a sign-in code simply asks for another.
 */
export class SmsMaybeSent extends SmsSendError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SmsMaybeSent";
  }
}

/** The kill switch (`SMS_PAUSED=true`): refuses every message. */
export function createPausedSmsSender(): SmsSender {
  return {
    send: () => Promise.reject(new SmsSendError("SMS sending is paused (SMS_PAUSED)")),
  };
}

export interface DevSmsSender extends SmsSender {
  /** The last messages sent, oldest first; tests read codes from here. */
  readonly outbox: readonly SmsMessage[];
}

const outboxSize = 50;

/**
 * For development and tests: prints each message in the API terminal instead
 * of sending it. Never used in production (the config refuses it), and the
 * line goes to the terminal, not to the logs.
 */
export function createDevSmsSender(options: { print: (line: string) => void }): DevSmsSender {
  const outbox: SmsMessage[] = [];
  return {
    outbox,
    send(message) {
      outbox.push(message);
      if (outbox.length > outboxSize) outbox.shift();
      const hidden = `${message.to.slice(0, 4)}${"•".repeat(Math.max(0, message.to.length - 6))}${message.to.slice(-2)}`;
      options.print(`[dev SMS to ${hidden}] ${message.text}`);
      return Promise.resolve();
    },
  };
}
