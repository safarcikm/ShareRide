import type { CallFailure } from "@shareride/api-client";
import { putEmailRoute, type Me } from "@shareride/contracts";
import { normaliseEmail } from "@shareride/domain";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText, formatWait } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { TextField } from "@/components/text-field";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { BackToMenu } from "@/navigation/back-to-menu";
import { ConfirmWithCode } from "@/privacy/confirm-with-code";
import { spacing } from "@/theme/tokens";

/**
 * Adding or changing one's email (spec 1, 3.5; plan 4.6): a link goes to
 * the address, and it is the account's once the link is opened. The
 * address is checked with the API's own rule before sending. The email
 * signs in, so past the account's first 30 minutes a confirm code comes
 * first (spec 26, 3.7): the API asks for it, and the form appears. The
 * title is at the left, with what the email is for under it (spec 31,
 * 3.19).
 */
export default function EmailScreen() {
  const me = useMe();
  if (me === null) return <BackToMenu />;
  return <EmailForm me={me} />;
}

function EmailForm({ me }: { readonly me: Me }) {
  const { t } = useLanguage();
  const session = useSession();
  const [address, setAddress] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The address waiting for a confirm code, while the form for it shows.
  const [confirming, setConfirming] = useState<string | null>(null);
  // When a new confirm code can be asked for, kept while the form closes and opens.
  const [sentUntil, setSentUntil] = useState(0);
  const sending = useRef(false);

  /** Words for a refusal that is not about the code. */
  function describe(failure: CallFailure): string {
    const { code, retryAfterSeconds = 0 } = failure.error;
    if (code === "rate_limited") {
      // Over a minute to wait: the day's five links are used.
      const limit =
        retryAfterSeconds > 60 ? "error.email_rate_limited_day" : "error.email_rate_limited";
      return t(limit, { wait: formatWait(t, retryAfterSeconds) });
    }
    if (code === "email_invalid") return t("error.email");
    if (code === "email_failed" || code === "email_unavailable") return t(`error.${code}`);
    return errorText(t, failure);
  }

  async function confirmed(code: string) {
    if (confirming === null) return { ok: true } as const;
    const result = await session.call(putEmailRoute, { body: { email: confirming, code } });
    if (!result.ok) return result;
    session.update(result.data);
    setAddress("");
    setConfirming(null);
    return { ok: true } as const;
  }

  async function send(input: string) {
    if (sending.current) return;
    setError(null);
    const valid = normaliseEmail(input);
    if (!valid.ok) {
      setFieldError(t("error.email"));
      return;
    }
    sending.current = true;
    setBusy(true);
    const result = await session.call(putEmailRoute, { body: { email: valid.value } });
    sending.current = false;
    setBusy(false);
    if (result.ok) {
      session.update(result.data);
      setAddress("");
      return;
    }
    const { code } = result.error;
    if (code === "confirm_required") setConfirming(valid.value);
    else if (code === "email_invalid") setFieldError(t("error.email"));
    else setError(describe(result));
  }

  const { pendingEmail } = me;
  return (
    <Screen>
      <ScreenHead title={t("addEmail.title")} line={t("addEmail.intro")} back="/profile" />
      {me.email === null ? null : (
        <Body align="start">{t("addEmail.current", { email: me.email })}</Body>
      )}
      {pendingEmail === null ? null : (
        <View style={styles.waiting}>
          <Notice
            kind="info"
            urgent={false}
            message={t("addEmail.sent", { email: pendingEmail })}
          />
          <Button
            variant="secondary"
            label={t("addEmail.sendAgain")}
            disabled={busy}
            onPress={() => void send(pendingEmail)}
          />
        </View>
      )}
      <View style={styles.form}>
        <TextField
          label={t("addEmail.field")}
          help={t("addEmail.fieldHelp")}
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
          onSubmitEditing={() => void send(address)}
        />
        <Notice message={error} />
        {confirming === null ? (
          <Button label={t("addEmail.send")} busy={busy} onPress={() => void send(address)} />
        ) : (
          <ConfirmWithCode
            confirmLabel={t("addEmail.send")}
            onConfirm={confirmed}
            describe={describe}
            sentUntil={sentUntil}
            onSent={setSentUntil}
            onCancel={() => {
              setConfirming(null);
            }}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  waiting: { gap: spacing.sm },
  form: { gap: spacing.lg, marginTop: spacing.md },
});
