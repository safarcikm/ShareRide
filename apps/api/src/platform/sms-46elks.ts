import { SmsSendError, type SmsSender } from "./sms.ts";

export interface ElksSmsOptions {
  readonly username: string;
  readonly password: string;
  /** The name the recipient sees: up to 11 letters and digits, starting with a letter. */
  readonly sender: string;
  /** Checks the request and its cost without sending (the contract test). */
  readonly dryRun?: boolean;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

const endpoint = "https://api.46elks.com/a1/sms";

/**
 * Sends SMS through 46elks (ADR 0019). `dontlog=message` keeps the text, and
 * so the sign-in code, out of the 46elks message history. Errors name the
 * HTTP status only: 46elks error texts can repeat the number.
 */
export function createElksSmsSender(options: ElksSmsOptions): SmsSender {
  const fetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const authorization = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString("base64")}`;

  return {
    async send(message) {
      const body = new URLSearchParams({
        from: options.sender,
        to: message.to,
        message: message.text,
        dontlog: "message",
      });
      if (options.dryRun === true) body.set("dryrun", "yes");

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            authorization,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new SmsSendError("46elks could not be reached in time", { cause: error });
      }
      if (!response.ok) {
        throw new SmsSendError(`46elks refused the message (HTTP ${String(response.status)})`);
      }
      const answer: unknown = await response.json().catch(() => null);
      const status =
        typeof answer === "object" && answer !== null && "status" in answer
          ? answer.status
          : undefined;
      if (status === "failed") throw new SmsSendError("46elks could not send the message");
    },
  };
}
