import { neverLeft } from "./maybe-sent.ts";
import { SmsMaybeSent, SmsSendError, type SmsSender } from "./sms.ts";

export interface VonageSmsOptions {
  readonly apiKey: string;
  readonly apiSecret: string;
  /** The name the recipient sees: up to 11 letters and digits, starting with a letter. */
  readonly sender: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * The SMS API's EU endpoint. Vonage stores SMS records in Dublin and
 * Frankfurt; processing is not limited to the EU (ADR 0023).
 */
const endpoint = "https://api-eu.vonage.com/sms/json";

/** Vonage's send statuses worth naming in a log; any other is named by number. */
const statuses: Readonly<Record<string, string>> = {
  "1": "throttled",
  "2": "missing parameters",
  "3": "invalid parameters",
  "4": "invalid credentials",
  "5": "internal error",
  "6": "invalid message",
  "7": "number barred",
  "8": "account barred",
  "9": "out of credit",
  "15": "sender name not allowed",
  "29": "number not verified on a trial account",
};

/** Server errors that can come after Vonage took the message. */
const afterTaking = new Set([500, 502, 504]);

/**
 * Sends SMS through Vonage's SMS API (ADR 0023). Every message goes as
 * unicode, because Icelandic letters such as ð and þ are not in the GSM
 * alphabet: a sign-in code fits one part, a booking's news two
 * (sms-texts.test.ts). Errors name the status only: Vonage's error texts can
 * repeat the number. A request that never left, or that Vonage refused in
 * full, can be tried again; a lost or odd answer after sending, or a message
 * taken only in part, may mean it went out (`SmsMaybeSent`), as the SMS API
 * has no idempotency key.
 */
export function createVonageSmsSender(options: VonageSmsOptions): SmsSender {
  const fetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const authorization = `Basic ${Buffer.from(`${options.apiKey}:${options.apiSecret}`).toString("base64")}`;

  return {
    async send(message) {
      const body = new URLSearchParams({
        from: options.sender,
        // E.164 without its +.
        to: message.to.replace(/^\+/, ""),
        text: message.text,
        type: "unicode",
      });

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
        if (neverLeft(error))
          throw new SmsSendError("Vonage could not be reached", { cause: error });
        throw new SmsMaybeSent("Vonage did not answer in time", { cause: error });
      }
      if (!response.ok) {
        const status = `HTTP ${String(response.status)}`;
        if (afterTaking.has(response.status)) {
          throw new SmsMaybeSent(`Vonage failed with ${status}`);
        }
        throw new SmsSendError(`Vonage refused the message (${status})`);
      }
      const parts = partStatuses(await response.json().catch(() => null));
      if (parts.length === 0 || parts.includes("unexpected")) {
        throw new SmsMaybeSent("Vonage gave an answer without a status (status unexpected)");
      }
      const refused = parts.find((status) => status !== "0");
      if (refused !== undefined) {
        const reason = statuses[refused];
        const said = `status ${refused}${reason === undefined ? "" : `: ${reason}`}`;
        // A part taken may reach the phone, so the message is not sent again.
        if (parts.includes("0")) {
          throw new SmsMaybeSent(`Vonage took only part of the message (${said})`);
        }
        throw new SmsSendError(`Vonage could not send the message (${said})`);
      }
    },
  };
}

/**
 * The status of each part in Vonage's answer, as text ("0" is accepted).
 * Anything but a short number becomes "unexpected", so no odd text reaches
 * the logs.
 */
function partStatuses(answer: unknown): string[] {
  if (typeof answer !== "object" || answer === null || !("messages" in answer)) return [];
  const { messages } = answer;
  if (!Array.isArray(messages)) return [];
  return messages.map((part: unknown) => {
    const status =
      typeof part === "object" && part !== null && "status" in part ? part.status : undefined;
    const text = typeof status === "string" || typeof status === "number" ? String(status) : "";
    return /^\d{1,3}$/.test(text) ? text : "unexpected";
  });
}
