import type { PhoneNeeded } from "@shareride/contracts";
import {
  callingCode,
  normaliseEmail,
  normalisePhoneNumber,
  type SignInProvider,
  type SignInWay,
} from "@shareride/domain";
import { countryNames } from "@shareride/i18n";
import { router, useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import type { CallFailure } from "@shareride/api-client";
import type { Translate } from "@shareride/i18n";
import { emailErrorText, errorText, formatWait } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { PausedBanner, useConfig } from "@/beta/config";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { PasswordField } from "@/components/password-field";
import { Screen, useWideScreen } from "@/components/screen";
import { Tag } from "@/components/tag";
import { TextField } from "@/components/text-field";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useSignInFlow } from "@/sign-in/flow";
import { KeptRideCard } from "@/sign-in/kept-ride-card";
import {
  devicePasskeys,
  keepPasskeyOptionsMs,
  passkeyFailure,
  type PasskeyAssertion,
  type PasskeyOptions,
} from "@/sign-in/passkey";
import { pendingExpiredText, phoneStepHelp } from "@/sign-in/pending";
import { ProviderButtons } from "@/sign-in/provider-buttons";
import { providerNames, useProviderWindow } from "@/sign-in/provider-window";
import { SignUpProgress } from "@/sign-in/sign-up-progress";
import { firstWay } from "@/sign-in/last-used";
import { forgetPasskeyHere, lastWay } from "@/sign-in/this-browser";
import { usePasskeyAutofill } from "@/sign-in/use-passkey-autofill";
import { usePasskeysOffered } from "@/sign-in/use-passkeys";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Step 1 of signing in or up: Continue with Google or Apple, Face ID or
 * fingerprint where the device has it, or the email, which gets a code
 * (spec 26, 3.1), or signs in with its password when one is typed (spec 27,
 * 3.1), under the ride kept on the way. After
 * an email or a Google or Apple account no account has, it asks for the
 * phone number, with a line on top saying why (spec 19, 3.3; spec 26,
 * 3.3): a text goes only to a number on its way into an account.
 */
export default function SignInScreen() {
  const flow = useSignInFlow();
  const { pending } = flow;
  return pending === null ? <ChooseHowScreen /> : <PhoneStepScreen pending={pending} />;
}

/** What a refused password sign-in says (spec 27, 3.2): one answer for every wrong try. */
function passwordErrorText(t: Translate, failure: CallFailure): string {
  const { code, retryAfterSeconds = 0 } = failure.error;
  if (code === "credentials_invalid") return t("error.credentialsInvalid");
  if (code === "rate_limited") {
    return t("error.passwordTries", { wait: formatWait(t, retryAfterSeconds) });
  }
  return errorText(t, failure);
}

/**
 * What a refused sign-in with Face ID or fingerprint says (spec 27, 3.3,
 * item 2): the same for a passkey removed as for the console's (spec 29, 3.4).
 */
function passkeyErrorText(t: Translate, failure: CallFailure): string {
  const { code, retryAfterSeconds = 0 } = failure.error;
  if (code === "passkey_invalid" || code === "passkey_unknown") return t("passkey.unknown");
  if (code === "passkey_expired") return t("passkey.expired");
  if (code === "rate_limited") {
    return t("error.passwordTries", { wait: formatWait(t, retryAfterSeconds) });
  }
  return errorText(t, failure);
}

/** Google or Apple, Face ID or fingerprint, or the email with a code or its password. */
function ChooseHowScreen() {
  const { locale, t } = useLanguage();
  const session = useSession();
  const flow = useSignInFlow();
  const { signInProviders, emailSignIn } = useConfig();
  const providerWindow = useProviderWindow();
  const passkeyOffered = usePasskeysOffered();
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providerBusy, setProviderBusy] = useState<SignInProvider | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  // Never kept in the flow: it goes when this screen does.
  const [password, setPassword] = useState("");
  // Options whose sheet was closed, used again on the next tap while their
  // challenge lasts: a browser may open the sheet only from a tap.
  const keptOptions = useRef<{ readonly options: PasskeyOptions; readonly until: number } | null>(
    null,
  );
  // Guards against a second tap or a Return key before the first reply.
  const sending = useRef(false);
  const focused = useIsFocused();
  const [last, setLast] = useState<SignInWay | null>(null);
  useEffect(() => {
    let live = true;
    void lastWay().then((way) => {
      if (live) setLast(way);
    });
    return () => {
      live = false;
    };
  }, []);
  // On a laptop the field takes the focus, so its suggestions show at once
  // (spec 29, 3.1, item 5); not on a phone, where the keyboard would cover the rest.
  const wide = useWideScreen();
  const focusEmail = Platform.OS === "web" && wide;
  // A passkey picked from the email field's suggestions (spec 29, 3.1).
  const autofill = usePasskeyAutofill({
    enabled: passkeyOffered && emailSignIn && focused,
    async onAnswer(credential) {
      if (sending.current) return false;
      sending.current = true;
      setError(null);
      flow.setNotice(null);
      setPasskeyBusy(true);
      try {
        return await finishPasskey(credential);
      } finally {
        sending.current = false;
        setPasskeyBusy(false);
      }
    },
  });

  /**
   * Opens the window at once, in the tap itself, so a browser lets the
   * pop-up open; then trades its ticket for a session or the phone step.
   */
  async function continueWith(provider: SignInProvider) {
    if (sending.current) return;
    setError(null);
    flow.setNotice(null);
    setProviderBusy(provider);
    autofill.pause();
    const opened = providerWindow.open(provider);
    const name = providerNames[provider];
    const outcome = await opened;
    if (outcome.kind !== "ticket") {
      setProviderBusy(null);
      autofill.resume();
      if (outcome.kind === "expired") setError(t("auth.provider.expired", { provider: name }));
      if (outcome.kind === "failed") setError(t("auth.provider.failed", { provider: name }));
      return;
    }
    const result = await session.finishProviderSignIn(outcome.ticket, outcome.verifier, provider);
    setProviderBusy(null);
    if (!result.ok) {
      autofill.resume();
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

  /**
   * Signs in with the device's answer, from the button's sheet or the email
   * field; true when signed in. A passkey the site no longer has is one this
   * browser stops offering (spec 29, 3.4).
   */
  async function finishPasskey(credential: PasskeyAssertion): Promise<boolean> {
    const signedIn = await session.signInWithPasskey(credential);
    // Signed in: sign-in closes by itself.
    if (signedIn.ok) return true;
    setError(passkeyErrorText(t, signedIn));
    // Before the field offers its passkeys again, so it does not offer this
    // one; and this browser may be offered Face ID again (3.2, item 5).
    if (signedIn.error.code === "passkey_unknown") {
      await devicePasskeys.forget(credential.id);
      await forgetPasskeyHere(credential.id);
    }
    return false;
  }

  /**
   * The device's own sheet, then signed in with no email typed (spec 27,
   * 3.3). Closing the sheet, or a browser with no passkey for PuffinRide,
   * changes nothing, and the next tap uses the same options. The email
   * field's quiet request waits meanwhile (spec 29, 3.1, item 4).
   */
  async function signInWithPasskey() {
    if (sending.current) return;
    sending.current = true;
    setError(null);
    flow.setNotice(null);
    setPasskeyBusy(true);
    autofill.pause();
    let signedIn = false;
    try {
      const before = keptOptions.current;
      keptOptions.current = null;
      let options: PasskeyOptions;
      if (before !== null && Date.now() < before.until) {
        options = before.options;
      } else {
        const asked = await session.passkeyOptions();
        if (!asked.ok) {
          setError(passkeyErrorText(t, asked));
          return;
        }
        options = asked.data.options;
      }
      let credential;
      try {
        credential = await devicePasskeys.get(options);
      } catch (failure) {
        if (passkeyFailure(failure) === "cancelled") {
          keptOptions.current = { options, until: Date.now() + keepPasskeyOptionsMs };
        } else {
          setError(t("error.generic"));
        }
        return;
      }
      signedIn = await finishPasskey(credential);
    } finally {
      sending.current = false;
      setPasskeyBusy(false);
      if (!signedIn) autofill.resume();
    }
  }

  /** The password when one is typed; otherwise, or when it was forgotten, a code by email. */
  async function send(forgot = false) {
    if (sending.current) return;
    setError(null);
    const address = normaliseEmail(flow.email);
    if (!address.ok) {
      setFieldError(
        forgot && flow.email.trim() === "" ? t("auth.forgotPasswordEmail") : t("error.email"),
      );
      return;
    }
    sending.current = true;
    flow.setNotice(null);
    setBusy(true);
    // A passkey picked from the field meanwhile would be lost: none is offered.
    autofill.pause();
    if (password !== "" && !forgot) {
      const signedIn = await session.signInWithPassword(address.value, password);
      sending.current = false;
      setBusy(false);
      // Signed in: sign-in closes by itself.
      if (!signedIn.ok) {
        setError(passwordErrorText(t, signedIn));
        autofill.resume();
      }
      return;
    }
    const result = await session.startEmail(address.value, locale);
    sending.current = false;
    setBusy(false);
    if (!result.ok) {
      autofill.resume();
      if (result.error.code === "email_invalid") setFieldError(t("error.email"));
      else setError(emailErrorText(t, result));
      return;
    }
    // After the code, Choose a password opens (spec 27, 3.4).
    flow.setForgotPassword(forgot);
    setPassword("");
    flow.emailCodeSent(address.value, result.data.resendAfterSeconds);
    router.push("/sign-in/email-code");
  }

  // The way this browser used last time, first and marked (spec 29, 3.5).
  const first = firstWay(last, {
    providers: signInProviders,
    passkey: passkeyOffered,
    email: emailSignIn,
  });
  const formFirst = first === "email" || first === "password";
  const providerFirst = first === "google" || first === "apple" ? first : null;
  const providers =
    providerFirst === null
      ? signInProviders
      : [providerFirst, ...signInProviders.filter((provider) => provider !== providerFirst)];
  const lastUsed = <Tag kind="info" label={t("auth.lastUsed")} />;
  const passkeyButton = passkeyOffered ? (
    <Button
      variant="secondary"
      fill
      label={t("auth.passkey")}
      busy={passkeyBusy}
      disabled={busy || providerBusy !== null}
      onPress={() => void signInWithPasskey()}
    />
  ) : null;
  const buttons =
    signInProviders.length > 0 || passkeyOffered ? (
      <View style={styles.providers}>
        {formFirst ? <OrWithEmail label={t("auth.or")} /> : null}
        {first === "passkey" ? (
          <>
            {lastUsed}
            {passkeyButton}
          </>
        ) : null}
        {providerFirst === null ? null : lastUsed}
        <ProviderButtons
          providers={providers}
          busy={providerBusy}
          disabled={!providerWindow.ready || busy || passkeyBusy}
          onPress={(provider) => void continueWith(provider)}
        />
        {first === "passkey" ? null : passkeyButton}
        {emailSignIn && !formFirst ? <OrWithEmail label={t("auth.orEmail")} /> : null}
      </View>
    ) : null;

  return (
    <Screen>
      {/* Who is new is not known yet: the steps start at the number (spec 29, 3.6). */}
      <SignUpProgress />
      <KeptRideCard kept={flow.keptRide} />
      <Title>{t("signIn.title")}</Title>
      <PausedBanner part="signups" />
      {formFirst ? null : buttons}
      {emailSignIn ? (
        <View style={styles.form}>
          {formFirst ? lastUsed : null}
          <TextField
            label={t("auth.email.label")}
            value={flow.email}
            onChangeText={(typed) => {
              flow.setEmail(typed);
              setFieldError(undefined);
            }}
            error={fieldError}
            keyboardType="email-address"
            autoComplete="username"
            // The browser lists the site's passkeys among its suggestions (spec 29, 3.1).
            webAutoComplete="username webauthn"
            autoFocus={focusEmail}
            textContentType="username"
            autoCapitalize="none"
            maxLength={320}
            onSubmitEditing={() => {
              // Held, as the button is, while Google's or Apple's window is open.
              if (providerBusy === null) void send();
            }}
          />
          <PasswordField
            label={t("auth.password")}
            help={t("auth.passwordHelp")}
            value={password}
            onChangeText={(typed) => {
              setPassword(typed);
              setError(null);
            }}
            purpose="current"
            onSubmitEditing={() => {
              if (providerBusy === null) void send();
            }}
          />
          <Notice message={error ?? flow.notice} />
          <Button
            label={t(password === "" ? "auth.email.send" : "auth.signIn")}
            busy={busy}
            disabled={providerBusy !== null || passkeyBusy}
            onPress={() => void send()}
          />
          <View style={styles.forgot}>
            <Button
              variant="text"
              label={t("auth.forgotPassword")}
              disabled={busy || providerBusy !== null || passkeyBusy}
              onPress={() => void send(true)}
            />
          </View>
          <Body>{t("auth.email.before")}</Body>
        </View>
      ) : (
        <View style={styles.form}>
          <Body>{t("auth.email.unavailable")}</Body>
          <Notice message={error ?? flow.notice} />
        </View>
      )}
      {formFirst ? buttons : null}
    </Screen>
  );
}

/** Step 2: the phone number, texted a code once (spec 26, 3.3). */
function PhoneStepScreen({ pending }: { readonly pending: PhoneNeeded }) {
  const { locale, t } = useLanguage();
  const session = useSession();
  const flow = useSignInFlow();
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Guards against a second tap or a Return key before the first reply.
  const sending = useRef(false);
  const country = countryNames[locale][flow.country];
  const code = callingCode(flow.country);

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
    const result = await session.start(phoneNumber.value.e164, locale, pending.pendingSignIn);
    sending.current = false;
    setBusy(false);
    if (!result.ok) {
      // Waited too long: back to the choice, which says why.
      if (result.error.code === "provider_expired") {
        flow.setNotice(pendingExpiredText(t, pending));
        flow.setPending(null);
        return;
      }
      setError(errorText(t, result));
      return;
    }
    flow.codeSent(phoneNumber.value.e164, result.data.resendAfterSeconds);
    router.push("/sign-in/code");
  }

  return (
    <Screen>
      <SignUpProgress step={2} />
      <KeptRideCard kept={flow.keptRide} />
      <Title>{t("auth.provider.phoneTitle")}</Title>
      <Body>{phoneStepHelp(t, pending)}</Body>
      {/* The wrong account, or another way after all: back to the choice. */}
      <Button
        variant="text"
        label={t("auth.provider.another")}
        disabled={busy}
        onPress={() => {
          flow.setNotice(null);
          flow.setPending(null);
        }}
      />
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
          onSubmitEditing={() => void send()}
        />
        <Notice message={error ?? flow.notice} />
        <Button label={t("auth.phone.send")} busy={busy} onPress={() => void send()} />
      </View>
    </Screen>
  );
}

/** "or with your email", between two lines. */
function OrWithEmail({ label }: { readonly label: string }) {
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
  forgot: { alignItems: "flex-start" },
  providers: { gap: spacing.md, marginTop: spacing.md },
  or: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  orLabel: { flexShrink: 1, textAlign: "center" },
});
