import type { EmailMessage, EmailSender } from "./email.ts";

// The development outbox (plan 4.6): `EMAIL_PROVIDER=dev` prints each email
// in the API terminal instead of sending it. Refused in production.

export interface DevEmailSender extends EmailSender {
  /** The last emails sent, oldest first; tests read links from here. */
  readonly outbox: readonly EmailMessage[];
}

const outboxSize = 50;

/** The address with all but its first two letters and its domain hidden. */
function hidden(address: string): string {
  const at = address.lastIndexOf("@");
  if (at < 0) return "•••";
  return `${address.slice(0, Math.min(2, at))}•••${address.slice(at)}`;
}

/**
 * Prints each email's subject and text in the terminal, not the logs, and
 * keeps the last 50. The address is partly hidden, as for SMS.
 */
export function createDevEmailSender(options: {
  readonly print: (line: string) => void;
}): DevEmailSender {
  const outbox: EmailMessage[] = [];
  return {
    outbox,
    send(message) {
      outbox.push(message);
      if (outbox.length > outboxSize) outbox.shift();
      options.print(`[dev email to ${hidden(message.to)}] ${message.subject}\n${message.text}`);
      return Promise.resolve({ id: `dev-${message.idempotencyKey}` });
    },
  };
}
