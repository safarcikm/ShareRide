import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { PasskeySetUp, setUpOutcomeText } from "@/sign-in/passkey-set-up";
import { declineOffer } from "@/sign-in/this-browser";
import { spacing } from "@/theme/tokens";

/** On to where the sign-in went. */
function goOn() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/**
 * "Use Face ID or fingerprint next time?" (spec 29, 3.2): once, after a
 * member signs in another way on a browser that can keep a passkey. "Set it
 * up" works as in Settings, with the fresh sign-in as the proof, then says
 * so with Done; a device set up already says so too. "Not now" goes on, and
 * this browser is not asked again for 30 days.
 */
export default function FaceIdOfferScreen() {
  const { t } = useLanguage();
  // What the device's sheet did: saved, or set up already.
  const [done, setDone] = useState<string | null>(null);
  // While the device's sheet is open, leaving would hide how it went.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done !== null) {
    return (
      <Screen>
        <Title>{t("passkeyOffer.title")}</Title>
        <TakesFocus>
          <Notice kind="info" message={done} />
        </TakesFocus>
        <View style={styles.choices}>
          <Button label={t("common.done")} onPress={goOn} />
        </View>
      </Screen>
    );
  }
  return (
    <Screen>
      <Title>{t("passkeyOffer.title")}</Title>
      <Body>{t("passkeyOffer.body")}</Body>
      <View style={styles.choices}>
        <PasskeySetUp
          variant="primary"
          label={t("passkeyOffer.setUp")}
          onBusy={setBusy}
          onOutcome={(outcome) => {
            const said = setUpOutcomeText(t, outcome);
            if (outcome.kind === "saved" || outcome.kind === "already") setDone(said);
            else setError(said);
          }}
        />
        <Button
          variant="text"
          label={t("password.notNow")}
          disabled={busy}
          onPress={() => {
            void declineOffer(now()).then(goOn);
          }}
        />
      </View>
      <Notice message={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({ choices: { gap: spacing.md, marginVertical: spacing.md } });
