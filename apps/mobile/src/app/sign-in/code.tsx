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
import { KeptRideCard } from "@/sign-in/kept-ride-card";
import { pendingExpiredText } from "@/sign-in/pending";
import { providerNames } from "@/sign-in/provider-window";
import { SignUpProgress } from "@/sign-in/sign-up-progress";
import { useSecondsUntil } from "@/sign-in/use-seconds-until";
import { spacing } from "@/theme/tokens";

const codeLength = codeRules.length;

/**
 * Step 2: the code from the text message, with a resend timer (spec 1,
 * screen 3; spec 16, 3.5), for the phone step of a waiting email, Google or
 * Apple sign-in (spec 26, 3.3). The code is checked as soon as six digits are in.
 * Signing in closes the sign-in screens, and the app goes on to step 3 for
 * a new account, or back to the ride kept for one that is ready.
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
  const { pending } = flow;
  if (phoneNumber === null || pending === null) return <Redirect href="/sign-in" />;

  async function verify(entered: string) {
    if (phoneNumber === null || pending === null || inFlight.current) return;
    if (entered.length !== codeLength) {
      setFieldError(t("auth.code.incomplete", { length: codeLength }));
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    const result = await session.verify(
      phoneNumber,
      entered,
      locale,
      flow.inviteCode,
      pending.pendingSignIn,
      pending.provider,
    );
    if (result.ok) return;
    inFlight.current = false;
    setBusy(false);
    setCode("");
    if (providerRefused(result.error.code)) return;
    // A new number while the beta is closed: the code was right and is
    // kept, and the next screen asks for the invite code (spec 12, 3.2.3).
    // The same for an invite link's code that did not work.
    const refused = result.error.code;
    if (refused === "invite_required" || refused === "invite_invalid" || refused === "beta_full") {
      flow.setRightCode(entered);
      flow.setNotice(refused === "invite_required" ? null : errorText(t, result));
      router.push("/sign-in/invite");
      return;
    }
    setMessage({ kind: "error", text: errorText(t, result) });
    const wait = result.error.retryAfterSeconds;
    if (result.error.code === "code_attempts_exceeded" && wait !== undefined) {
      flow.waitBeforeResend(wait);
    }
  }

  /**
   * The waiting sign-in was refused; the code was not used (spec 19, 3.3;
   * spec 26, 3.3). Too late, or a Google or Apple account another account
   * has: back to step 1, which says why, to start again with the email.
   */
  function providerRefused(code: string): boolean {
    if (pending === null) return false;
    if (code !== "provider_expired" && code !== "provider_in_use") return false;
    flow.setNotice(
      code === "provider_expired" || pending.provider === "email"
        ? pendingExpiredText(t, pending)
        : t("auth.provider.inUseRetry", { provider: providerNames[pending.provider] }),
    );
    flow.setPending(null);
    router.dismissTo("/sign-in");
    return true;
  }

  async function resend() {
    if (phoneNumber === null || pending === null || inFlight.current) return;
    inFlight.current = true;
    setResending(true);
    setMessage(null);
    const result = await session.start(phoneNumber, locale, pending.pendingSignIn);
    inFlight.current = false;
    setResending(false);
    if (result.ok) {
      flow.codeSent(phoneNumber, result.data.resendAfterSeconds);
      setMessage({ kind: "info", text: t("auth.code.resent") });
      return;
    }
    if (providerRefused(result.error.code)) return;
    setMessage({ kind: "error", text: errorText(t, result) });
    const wait = result.error.retryAfterSeconds;
    if (wait !== undefined) flow.waitBeforeResend(wait);
  }

  return (
    <Screen>
      <SignUpProgress step={2} />
      <KeptRideCard kept={flow.keptRide} />
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
