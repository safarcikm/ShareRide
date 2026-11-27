import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { PasskeySetUp, setUpOutcomeText } from "@/sign-in/passkey-set-up";
import { usePasskeysOffered } from "@/sign-in/use-passkeys";
import { spacing } from "@/theme/tokens";

/** On to where sign-up goes. */
function goOn() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/**
 * Sign in faster next time (spec 27, 3.7): once, after step 3, for a new
 * account with a verified email. "Use Face ID or fingerprint", where the
 * device has it, sets it up at once, then says so with Done; "Add a
 * password" opens Choose a password at once. The fresh sign-in is the proof
 * for both. "Not now" goes on to where sign-up goes. Both stay in Sign-in
 * methods, on Profile.
 */
export default function FasterScreen() {
  const { t } = useLanguage();
  const passkeyOffered = usePasskeysOffered();
  const [saved, setSaved] = useState(false);
  // While the device's sheet is open, leaving would hide how it went.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (saved) {
    return (
      <Screen>
        <Title>{t("signUp.faster.title")}</Title>
        <TakesFocus>
          <Notice kind="info" message={t("passkey.saved")} />
        </TakesFocus>
        <View style={styles.choices}>
          <Button label={t("common.done")} onPress={goOn} />
        </View>
      </Screen>
    );
  }
  return (
    <Screen>
      <Title>{t("signUp.faster.title")}</Title>
      <View style={styles.choices}>
        {passkeyOffered ? (
          <PasskeySetUp
            variant="primary"
            label={t("signUp.faster.passkey")}
            onBusy={setBusy}
            onOutcome={(outcome) => {
              if (outcome.kind === "saved") setSaved(true);
              else setError(setUpOutcomeText(t, outcome));
            }}
          />
        ) : null}
        <Button
          variant={passkeyOffered ? "secondary" : "primary"}
          label={t("signUp.faster.password")}
          disabled={busy}
          onPress={() => {
            router.replace("/settings/password");
          }}
        />
        <Button variant="text" label={t("password.notNow")} disabled={busy} onPress={goOn} />
      </View>
      <Notice message={error} />
      <Body>{t("signUp.faster.help")}</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({ choices: { gap: spacing.md, marginVertical: spacing.md } });
