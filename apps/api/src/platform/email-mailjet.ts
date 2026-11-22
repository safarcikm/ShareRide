import { EmailMaybeSent, type EmailSender } from "./email.ts";
import { neverLeft } from "./maybe-sent.ts";

// Email through Mailjet's Send API v3.1 (ADR 0027): one message per
// request, with open and click tracking off (R7.9) and its pictures inside
// it (spec 24, 3.4). Plain fetch, no SDK.

export interface MailjetOptions {
  readonly apiKey: string;
  readonly secretKey: string;
  /** Our sender, on a domain validated in Mailjet. */
  readonly from: { readonly email: string; readonly name: string };
  /** Mailjet checks the message and sends nothing: for the contract test. */
  readonly sandbox?: boolean;
  /** Well within the worker's two-minute lease, so a hung request never holds it. */
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

const sendEndpoint = "https://api.mailjet.com/v3.1/send";

/**
 * Errors that can come after Mailjet took the message: its own failure
 * midway, or a gateway that lost its answer. 503 (not available) and the
 * 4xx refusals come before.
 */
const afterTaking = new Set([500, 502, 504]);

const field = (from: unknown, name: string): unknown =>
  typeof from === "object" && from !== null && name in from
    ? (from as Record<string, unknown>)[name]
    : undefined;

/**
 * Mailjet's error codes in an answer, such as `mj-0013`: plain codes only,
 * never its messages, which can repeat the address.
 */
function errorCodes(answer: unknown): string {
  const messages: unknown = field(answer, "Messages");
  const parts: unknown[] = [answer, ...(Array.isArray(messages) ? (messages as unknown[]) : [])];
  const errors = parts.flatMap((part): unknown[] => {
    const listed: unknown = field(part, "Errors");
    return Array.isArray(listed) ? (listed as unknown[]) : [part];
  });
  const codes = errors
    .map((error) => field(error, "ErrorCode"))
    .filter((code): code is string => typeof code === "string" && /^[a-z]+-\d{1,6}$/.test(code));
  return codes.length === 0 ? "" : ` (${[...new Set(codes)].join(", ")})`;
}

/**
 * Sends email through Mailjet. Errors name the HTTP status and Mailjet's
 * error codes only. A request that never left, or that Mailjet refused, can
 * be tried again; a lost or odd answer after sending, or a server error
 * that can come after taking it, may mean it went out (`EmailMaybeSent`),
 * as Mailjet has no idempotency key.
 */
export function createMailjetEmailSender(options: MailjetOptions): EmailSender {
  const fetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const authorization = `Basic ${Buffer.from(`${options.apiKey}:${options.secretKey}`).toString("base64")}`;

  return {
    async send(message) {
      const body = {
        ...(options.sandbox === true ? { SandboxMode: true } : {}),
        Messages: [
          {
            From: { Email: options.from.email, Name: options.from.name },
            To: [{ Email: message.to }],
            Subject: message.subject,
            TextPart: message.text,
            HTMLPart: message.html,
            CustomID: message.idempotencyKey,
            TrackOpens: "disabled",
            TrackClicks: "disabled",
            // The pictures the HTML shows as cid:… (spec 24, 3.4).
            ...(message.images === undefined || message.images.length === 0
              ? {}
              : {
                  InlinedAttachments: message.images.map((image) => ({
                    ContentType: image.contentType,
                    Filename: image.filename,
                    ContentID: image.contentId,
                    Base64Content: Buffer.from(image.content).toString("base64"),
                  })),
                }),
          },
        ],
      };
      let response: Response;
      try {
        response = await fetch(sendEndpoint, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            authorization,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (neverLeft(error)) throw new Error("Mailjet could not be reached", { cause: error });
        throw new EmailMaybeSent("Mailjet did not answer in time", { cause: error });
      }
      const answer: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const status = `HTTP ${String(response.status)}`;
        if (afterTaking.has(response.status)) {
          throw new EmailMaybeSent(`Mailjet failed with ${status}${errorCodes(answer)}`);
        }
        throw new Error(`Mailjet refused the email (${status})${errorCodes(answer)}`);
      }
      const [sent] = [field(answer, "Messages")].flat();
      const status = field(sent, "Status");
      if (status === "error") {
        throw new Error(`Mailjet refused the email${errorCodes(answer)}`);
      }
      const [to] = [field(sent, "To")].flat();
      const id = field(to, "MessageUUID");
      if (status !== "success" || typeof id !== "string") {
        throw new EmailMaybeSent("Mailjet gave an answer out of shape");
      }
      return { id };
    },
  };
}
