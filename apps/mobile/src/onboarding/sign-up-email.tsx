import { putEmailRoute, type Me } from "@shareride/contracts";
import { normaliseEmail } from "@shareride/domain";
import { useRef, useState } from "react";
import { errorText, formatWait } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { TextField } from "@/components/text-field";
import { useLanguage } from "@/i18n/language";
import { emailAtSignUp } from "./email-at-sign-up";

/**
 * The email at step 3 of signing up on the web (spec 20, 3.3), for an
 * account with neither a verified email nor a link waiting: Google and
 * Apple bring theirs. Asked or not as the step opens, so the field stays
 * once its link is sent. `check` runs with the profile's own checks; `send`
 * sends the link before the profile is saved, once for each address, so a
 * retry after a failed save sends no second one.
 */
export function useSignUpEmail(me: Me | null) {
  const { t } = useLanguage();
  const session = useSession();
  const [asked] = useState(
    () => emailAtSignUp() && me !== null && me.email === null && me.pendingEmail === null,
  );
  const [address, setAddress] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const sentTo = useRef<string | null>(null);

  /** False, with the field's error, while the address cannot be used. */
  function check(): boolean {
    if (!asked || normaliseEmail(address).ok) return true;
    setFieldError(t("error.email"));
    return false;
  }

  /** Sends the link; a text stops the step and says why. */
  async function send(): Promise<string | null> {
    const valid = normaliseEmail(address);
    if (!asked || !valid.ok || sentTo.current === valid.value) return null;
    const result = await session.call(putEmailRoute, { body: { email: valid.value } });
    if (result.ok) {
      session.update(result.data);
      sentTo.current = valid.value;
      return null;
    }
    const { code, retryAfterSeconds = 0 } = result.error;
    // A server that sends no email, such as one on a laptop: sign-up goes on
    // without it (item 3).
    if (code === "email_unavailable") {
      sentTo.current = valid.value;
      return null;
    }
    if (code === "rate_limited") {
      const limit =
        retryAfterSeconds > 60 ? "error.email_rate_limited_day" : "error.email_rate_limited";
      return t(limit, { wait: formatWait(t, retryAfterSeconds) });
    }
    if (code === "email_invalid") return t("error.email");
    if (code === "email_failed") return t("error.email_failed");
    return errorText(t, result);
  }

  const field = asked ? (
    <TextField
      label={t("addEmail.field")}
      help={t("onboarding.emailHelp")}
      error={fieldError}
      value={address}
      onChangeText={(value) => {
        setAddress(value);
        setFieldError(undefined);
      }}
      keyboardType="email-address"
      autoComplete="email"
      textContentType="emailAddress"
      autoCapitalize="none"
      maxLength={320}
    />
  ) : null;
  return { field, check, send };
}
