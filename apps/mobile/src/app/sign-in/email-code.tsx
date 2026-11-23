import { codeRules } from "@shareride/domain";
import { Redirect, router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { emailErrorText, errorText, formatWait } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { forgetPendingLink, keepPendingLinkIfNone } from "@/navigation/kept-link";
import { useSignInFlow } from "@/sign-in/flow";
import { KeptRideCard } from "@/sign-in/kept-ride-card";
import { SignUpProgress } from "@/sign-in/sign-up-progress";
import { useSecondsUntil } from "@/sign-in/use-seconds-until";
import { spacing } from "@/theme/tokens";

const codeLength = codeRules.length;
const choosePassword = "/settings/password";

/**
 * Still step 1: the code from the email, with a resend timer (spec 26,
 * 3.2). The code is checked as soon as six digits are in. An account with
 * that email is signed in, and sign-in closes; otherwise the phone step
 * comes next, on step 1's screen.
 */
export default function EmailCodeScreen() {
  const { locale, t } = useLanguage();
  const session = useSession();
  const flow = useSignInFlow();
  const secondsLeft = useSecondsUntil(flow.emailResendAt);
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  // Guards against a second tap or a Return key before the first reply.
  const inFlight = useRef(false);

  const email = flow.emailSentTo;
  if (email === null) return <Redirect href="/sign-in" />;

  /** Back to step 1, where the phone step or the email field is. */
  function backToStart() {
    if (router.canGoBack()) router.back();
    else router.replace("/sign-in");
  }

  async function verify(entered: string) {
    if (email === null || inFlight.current) return;
    if (entered.length !== codeLength) {
      setFieldError(t("auth.code.incomplete", { length: codeLength }));
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    // Kept before the code goes, so it waits when sign-in closes; not in
    // place of a link opened from an email, which goes first (spec 27, 3.4).
    const forgot = flow.forgotPassword ? choosePassword : null;
    if (forgot !== null) await keepPendingLinkIfNone(forgot, now());
    const result = await session.verifyEmail(email, entered);
    if (result.ok) {
      // Signed in: sign-in closes by itself. Otherwise the phone number comes next.
      if (result.data.status === "phoneNeeded") {
        flow.setNotice(null);
        flow.setPending(result.data);
        backToStart();
      }
      return;
    }
    if (forgot !== null) await forgetPendingLink(forgot);
    inFlight.current = false;
    setBusy(false);
    setCode("");
    setMessage({ kind: "error", text: errorText(t, result) });
    const wait = result.error.retryAfterSeconds;
    if (result.error.code === "code_attempts_exceeded" && wait !== undefined) {
      flow.waitBeforeEmailResend(wait);
    }
  }

  async function resend() {
    if (email === null || inFlight.current) return;
    inFlight.current = true;
    setResending(true);
    setMessage(null);
    const result = await session.startEmail(email, locale);
    inFlight.current = false;
    setResending(false);
    if (result.ok) {
      flow.emailCodeSent(email, result.data.resendAfterSeconds);
      setMessage({ kind: "info", text: t("auth.code.resent") });
      return;
    }
    setMessage({ kind: "error", text: emailErrorText(t, result) });
    const wait = result.error.retryAfterSeconds;
    if (wait !== undefined) flow.waitBeforeEmailResend(wait);
  }

  return (
    <Screen>
      <SignUpProgress step={1} />
      <KeptRideCard kept={flow.keptRide} />
      <Title>{t("auth.code.title")}</Title>
      <Body>{t("auth.emailCode.help", { length: codeLength, email })}</Body>
      <View style={styles.form}>
        <TextField
          label={t("auth.code.label", { length: codeLength })}
          value={code}
          onChangeText={(typed) => {
            const digits = typed.replace(/\D/g, "").slice(0, codeLength);
            setCode(digits);
            setFieldError(undefined);
            if (digits.length === codeLength) void verify(digits);
          }}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={codeLength}
          error={fieldError}
          autoFocus
        />
        <Notice message={message?.text ?? null} kind={message?.kind} />
        <Button label={t("auth.code.signIn")} busy={busy} onPress={() => void verify(code)} />
        {secondsLeft > 0 ? (
          <Body>{t("auth.code.resendIn", { wait: formatWait(t, secondsLeft) })}</Body>
        ) : (
          <Button
            variant="secondary"
            label={t("auth.code.resend")}
            busy={resending}
            onPress={() => void resend()}
          />
        )}
        <Button variant="text" label={t("auth.emailCode.change")} onPress={backToStart} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ form: { gap: spacing.md, marginTop: spacing.md } });
