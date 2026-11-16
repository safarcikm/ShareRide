import type { EmailConfig } from "../config.ts";
import type { EmailChannel } from "./email.ts";
import { createDevEmailSender } from "./email-dev.ts";
import { createMailjetEmailSender } from "./email-mailjet.ts";

/**
 * The email the configuration asks for, used by the requests (adding an
 * email) and the worker alike. None means email is off: adding one is
 * refused and the worker skips email (`email_off`).
 */
export function selectEmail(
  config: EmailConfig,
  print: (line: string) => void,
  fetch?: typeof globalThis.fetch,
): EmailChannel | undefined {
  switch (config.provider) {
    case "none":
      return undefined;
    case "dev":
      return { sender: createDevEmailSender({ print }), webAppUrl: config.webAppUrl };
    case "mailjet":
      return {
        sender: createMailjetEmailSender({
          apiKey: config.apiKey,
          secretKey: config.secretKey,
          from: config.from,
          ...(fetch === undefined ? {} : { fetch }),
        }),
        webAppUrl: config.webAppUrl,
      };
  }
}
