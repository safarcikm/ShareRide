import type { CallFailure } from "@shareride/api-client";
import type { Translate } from "@shareride/i18n";
import { errorText, formatWait } from "@/auth/errors";

/** Why trips could not be loaded: too many searches, no connection, or another failure. */
export function failureText(t: Translate, failure: CallFailure): string {
  if (failure.error.code === "rate_limited") {
    return t("results.rateLimited", {
      wait: formatWait(t, failure.error.retryAfterSeconds ?? 60),
    });
  }
  return failure.error.code === "network_error" ? errorText(t, failure) : t("results.failed");
}
