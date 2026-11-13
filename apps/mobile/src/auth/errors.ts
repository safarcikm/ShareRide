import type { CallFailure } from "@shareride/api-client";
import type { Translate } from "@shareride/i18n";

/** A wait in words: seconds under a minute, otherwise whole minutes rounded up. */
export function formatWait(t: Translate, seconds: number): string {
  return seconds < 60
    ? t("auth.wait.seconds", { count: seconds })
    : t("auth.wait.minutes", { count: Math.ceil(seconds / 60) });
}

/** What to tell the person about a failed call, in their language. */
export function errorText(t: Translate, failure: CallFailure): string {
  const { code, retryAfterSeconds = 0, attemptsLeft = 0 } = failure.error;
  switch (code) {
    case "phone_invalid":
    case "phone_country_unsupported":
    case "sms_failed":
    case "code_expired":
    case "account_unavailable":
    case "network_error":
    case "legal_version_outdated":
      return t(`error.${code}`);
    case "rate_limited":
      return t("error.rate_limited", { wait: formatWait(t, retryAfterSeconds) });
    case "code_invalid":
      return t("error.code_invalid", { attemptsLeft });
    case "code_attempts_exceeded":
      return retryAfterSeconds > 0
        ? t("error.code_attempts_exceeded", { wait: formatWait(t, retryAfterSeconds) })
        : t("error.code_attempts_exceeded_now");
    default:
      return t("error.generic");
  }
}
