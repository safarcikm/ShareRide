import { callingCode, codeRules, normalisePhoneNumber } from "@shareride/domain";
import { countryNames } from "@shareride/i18n";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useSignInFlow } from "@/sign-in/flow";
import { KeptRideCard } from "@/sign-in/kept-ride-card";
import { SignUpProgress } from "@/sign-in/sign-up-progress";
import { spacing } from "@/theme/tokens";

/**
 * Step 1 of signing in or up: the phone number, with the country picker
 * (spec 1, screen 2; spec 16, 3.5), under the ride kept on the way.
 */
export default function PhoneNumberScreen() {
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

  return (
    <Screen>
      <SignUpProgress step={1} />
      <KeptRideCard kept={flow.keptRide} />
      <Title>{t("signIn.title")}</Title>
      <Body>{t("signIn.help", { length: codeRules.length })}</Body>
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

const styles = StyleSheet.create({ form: { gap: spacing.md, marginTop: spacing.md } });
