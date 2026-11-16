import type { EmailConfig } from "../config.ts";
import type { EmailSender } from "./email.ts";
import { createDevEmailSender } from "./email-dev.ts";
import { createMailjetEmailSender } from "./email-mailjet.ts";

/** The sender the configuration asks for; none means the worker skips email (`email_off`). */
export function selectEmailSender(
  config: EmailConfig,
  print: (line: string) => void,
  fetch?: typeof globalThis.fetch,
): EmailSender | undefined {
  switch (config.provider) {
    case "none":
      return undefined;
    case "dev":
      return createDevEmailSender({ print });
    case "mailjet":
      return createMailjetEmailSender({
        apiKey: config.apiKey,
        secretKey: config.secretKey,
        from: config.from,
        ...(fetch === undefined ? {} : { fetch }),
      });
  }
}
