export interface SmsMessage {
  /** E.164. */
  readonly to: string;
  readonly text: string;
}

/**
 * Sends text messages. Milestone 2 adds an adapter for an SMS provider in
 * the EEA; until then only the development sender exists.
 */
export interface SmsSender {
  send(message: SmsMessage): Promise<void>;
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
