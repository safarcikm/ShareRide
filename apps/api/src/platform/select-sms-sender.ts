import type { SmsConfig } from "../config.ts";
import { createElksSmsSender } from "./sms-46elks.ts";
import { createVonageSmsSender } from "./sms-vonage.ts";
import { createDevSmsSender, createPausedSmsSender, type SmsSender } from "./sms.ts";

/** The sender the configuration asks for; the kill switch wins over the provider. */
export function selectSmsSender(
  config: SmsConfig,
  print: (line: string) => void,
  fetch?: typeof globalThis.fetch,
): SmsSender {
  if (config.paused) return createPausedSmsSender();
  if (config.provider === "vonage") {
    return createVonageSmsSender({
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      sender: config.sender,
      ...(fetch === undefined ? {} : { fetch }),
    });
  }
  if (config.provider === "46elks") {
    return createElksSmsSender({
      username: config.username,
      password: config.password,
      sender: config.sender,
      ...(fetch === undefined ? {} : { fetch }),
    });
  }
  return createDevSmsSender({ print });
}
