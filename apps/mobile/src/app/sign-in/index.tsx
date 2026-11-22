import {
  callingCode,
  codeRules,
  normalisePhoneNumber,
  type SignInProvider,
} from "@shareride/domain";
import { countryNames } from "@shareride/i18n";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { PausedBanner, useConfig } from "@/beta/config";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useSignInFlow } from "@/sign-in/flow";
import { KeptRideCard } from "@/sign-in/kept-ride-card";
import { ProviderButtons } from "@/sign-in/provider-buttons";
import { providerNames, useProviderWindow } from "@/sign-in/provider-window";
import { SignUpProgress } from "@/sign-in/sign-up-progress";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Step 1 of signing in or up: Continue with Google or Apple, or the phone
 * number with the country picker (spec 1, screen 2; spec 16, 3.5; spec 19,
 * 3.1), under the ride kept on the way. After a Google or Apple account
 * ShareRide does not know, it asks for the phone number, with a line on
 * top saying why (spec 19, 3.3).
 */
export default function PhoneNumberScreen() {
  const { locale, t } = useLanguage();
  const session = useSession();
  const flow = useSignInFlow();
  const { signInProviders } = useConfig();
  const providerWindow = useProviderWindow();
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providerBusy, setProviderBusy] = useState<SignInProvider | null>(null);
  // Guards against a second tap or a Return key before the first reply.
  const sending = useRef(false);
  const country = countryNames[locale][flow.country];
  const code = callingCode(flow.country);
  const { pending } = flow;

  /**
   * Opens the window at once, in the tap itself, so a browser lets the
   * pop-up open; then trades its ticket for a session or the phone step.
   */
  async function continueWith(provider: SignInProvider) {
    if (sending.current) return;
    setError(null);
    flow.setNotice(null);
    setProviderBusy(provider);
    const opened = providerWindow.open(provider);
    const name = providerNames[provider];
    const outcome = await opened;
    if (outcome.kind !== "ticket") {
      setProviderBusy(null);
      if (outcome.kind === "expired") setError(t("auth.provider.expired", { provider: name }));
      if (outcome.kind === "failed") setError(t("auth.provider.failed", { provider: name }));
      return;
    }
    const result = await session.finishProviderSignIn(outcome.ticket, outcome.verifier);
    setProviderBusy(null);
    if (!result.ok) {
      setError(
        result.error.code === "ticket_invalid"
          ? t("auth.provider.failed", { provider: name })
          : errorText(t, result),
      );
      return;
    }
    // Signed in: sign-in closes by itself. Otherwise the phone number comes next.
    if (result.data.status === "phoneNeeded") flow.setPending(result.data);
  }

  async function send() {
    if (sending.current) return;
    setError(null);
    const phoneNumber = normalisePhoneNumber(flow.typed, flow.country);
    if (!phoneNumber.ok) {
      setFieldError(t(`error.${phoneNumber.error.code}`));
      return;
    }
    sending.current = true;
    flow.setNotice(null);
    setBusy(true);
    const result = await session.start(phoneNumber.value.e164, locale);
    sending.current = false;
    setBusy(false);
    if (!result.ok) {
      setError(errorText(t, result));
      return;
    }
    flow.codeSent(phoneNumber.value.e164, result.data.resendAfterSeconds);
    router.push("/sign-in/code");
  }

  const pendingName = pending === null ? null : providerNames[pending.provider];
  return (
    <Screen>
      <SignUpProgress step={1} />
      <KeptRideCard kept={flow.keptRide} />
      {pending === null || pendingName === null ? (
        <>
          <Title>{t("signIn.title")}</Title>
          {signInProviders.length > 0 ? (
            <View style={styles.providers}>
              <ProviderButtons
                providers={signInProviders}
                busy={providerBusy}
                disabled={!providerWindow.ready || busy}
                onPress={(provider) => void continueWith(provider)}
              />
              <OrWithPhone label={t("auth.orPhone")} />
            </View>
          ) : null}
          <Body>{t("signIn.help", { length: codeRules.length })}</Body>
        </>
      ) : (
        <>
          <Title>{t("auth.provider.phoneTitle")}</Title>
          <Body>
            {pending.email === null
              ? t("auth.provider.phoneHelpHidden", { provider: pendingName })
              : t("auth.provider.phoneHelp", { provider: pendingName, email: pending.email })}
          </Body>
          {/* The wrong account, or another way after all: back to the choice. */}
          <Button
            variant="text"
            label={t("auth.provider.another")}
            disabled={busy}
            onPress={() => {
              setError(null);
              flow.setPending(null);
            }}
          />
        </>
      )}
      <PausedBanner part="sms" />
      <PausedBanner part="signups" />
      <View style={styles.form}>
        <Button
          variant="secondary"
          label={`${country} +${code}`}
          accessibilityLabel={t("auth.phone.countryLabel", { country, callingCode: code })}
          onPress={() => {
            router.push("/sign-in/country");
          }}
        />
        <TextField
          label={t("auth.phone.label")}
          value={flow.typed}
          onChangeText={(typed) => {
            flow.setTyped(typed);
            setFieldError(undefined);
          }}
          error={fieldError}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          maxLength={20}
          onSubmitEditing={() => {
            // Held, as the button is, while Google's or Apple's window is open.
            if (providerBusy === null) void send();
          }}
        />
        <Notice message={error ?? flow.notice} />
        <Button
          label={t("auth.phone.send")}
          busy={busy}
          disabled={providerBusy !== null}
          onPress={() => void send()}
        />
      </View>
    </Screen>
  );
}

/** "or with your phone number", between two lines. */
function OrWithPhone({ label }: { readonly label: string }) {
  const palette = usePalette();
  const line = [styles.line, { backgroundColor: palette.border }];
  return (
    <View style={styles.or}>
      <View style={line} />
      <Text style={[typography.small, styles.orLabel, { color: palette.textMuted }]}>{label}</Text>
      <View style={line} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md, marginTop: spacing.md },
  providers: { gap: spacing.md, marginTop: spacing.md },
  or: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  orLabel: { flexShrink: 1, textAlign: "center" },
});
