import { codeRules, formatPhoneNumber } from "@shareride/domain";
import { Redirect, router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText, formatWait } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useSignInFlow } from "@/sign-in/flow";
import { useSecondsUntil } from "@/sign-in/use-seconds-until";
import { spacing } from "@/theme/tokens";

const codeLength = codeRules.length;

/**
 * The code from the text message, with a resend timer (spec 1, screen 3).
 * The code is checked as soon as six digits are in. Signing in closes the
 * sign-in screens, and the app goes on to the next step.
 */
export default function CodeScreen() {
  const { locale, t } = useLanguage();
  const session = useSession();
  const flow = useSignInFlow();
  const secondsLeft = useSecondsUntil(flow.resendAt);
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  // Guards against a second tap or a Return key before the first reply.
  const inFlight = useRef(false);

  const phoneNumber = flow.sentTo;
  if (phoneNumber === null) return <Redirect href="/sign-in" />;

  async function verify(entered: string) {
    if (phoneNumber === null || inFlight.current) return;
    if (entered.length !== codeLength) {
      setFieldError(t("auth.code.incomplete", { length: codeLength }));
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    const result = await session.verify(phoneNumber, entered, locale);
    if (result.ok) return;
    inFlight.current = false;
    setBusy(false);
    setCode("");
    setMessage({ kind: "error", text: errorText(t, result) });
    const wait = result.error.retryAfterSeconds;
    if (result.error.code === "code_attempts_exceeded" && wait !== undefined) {
      flow.waitBeforeResend(wait);
    }
  }

  async function resend() {
    if (phoneNumber === null || inFlight.current) return;
    inFlight.current = true;
    setResending(true);
    setMessage(null);
    const result = await session.start(phoneNumber, locale);
    inFlight.current = false;
    setResending(false);
    if (result.ok) {
      flow.codeSent(phoneNumber, result.data.resendAfterSeconds);
      setMessage({ kind: "info", text: t("auth.code.resent") });
      return;
    }
    setMessage({ kind: "error", text: errorText(t, result) });
    const wait = result.error.retryAfterSeconds;
    if (wait !== undefined) flow.waitBeforeResend(wait);
  }

  return (
    <Screen>
      <Title>{t("auth.code.title")}</Title>
      <Body>{t("auth.code.help", { phoneNumber: formatPhoneNumber(phoneNumber) })}</Body>
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
        <Button
          variant="text"
          label={t("auth.code.changeNumber")}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/sign-in");
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ form: { gap: spacing.md, marginTop: spacing.md } });
