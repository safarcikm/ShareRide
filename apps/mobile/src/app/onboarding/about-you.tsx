import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { keepPendingLinkIfNone } from "@/navigation/kept-link";
import { LegalPart, useCurrentDocuments } from "@/onboarding/legal-part";
import { useSignUpEmail } from "@/onboarding/sign-up-email";
import { ProfileForm } from "@/profile/profile-form";
import { createAccountKey, useKeptRide } from "@/sign-in/kept-ride";
import { KeptRideCard } from "@/sign-in/kept-ride-card";
import { SignUpProgress } from "@/sign-in/sign-up-progress";
import { spacing } from "@/theme/tokens";

/**
 * Step 3 of signing up, about you (spec 16, 3.5 item 4): the first name,
 * languages and a few words, and for a new account the age and the terms,
 * in one step, and on the web an email (spec 20, 3.3). The button sends
 * the email's link and accepts the documents shown, then saves the profile
 * (item 6); if saving fails the answers stay, and a retry does not send or
 * accept again. Saving completes the account: the app then opens the ride
 * kept on the way, or Find (_layout.tsx and the menu); with a verified
 * email and nothing else kept, "Sign in faster next time" first (spec 27,
 * 3.7).
 */
export default function AboutYouScreen() {
  const { t } = useLanguage();
  const session = useSession();
  const me = useMe();
  const kept = useKeptRide();
  // Read once: the name Google or Apple gave a new account (spec 19, 3.3).
  const [suggestedFirstName] = useState(() => session.signInNews()?.suggestedFirstName ?? null);
  const email = useSignUpEmail(me);
  // Asked once: the terms part stays as it opened after the terms are
  // accepted, so nothing moves if saving the profile then fails.
  const [askTerms] = useState(() => me?.missingSteps.includes("legal") ?? false);
  const [askAge] = useState(() => me?.ageConfirmed === false);
  const terms = useCurrentDocuments(askTerms);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [termsDone, setTermsDone] = useState(false);

  if (me === null) return null;

  /** Accepts the terms first, once; a text says why not. */
  async function acceptTerms(): Promise<string | null> {
    if (!askTerms || termsDone) return null;
    if (terms.documents === null) {
      // The button waits while they load; never saved without them.
      return terms.failure === null ? t("common.loading") : errorText(t, terms.failure);
    }
    if (!accepted || (askAge && !ageConfirmed)) return t("legal.needBoth");
    const result = await terms.accept(terms.documents, askAge);
    if (result.ok) {
      // The account now has only the profile left: if step 3 opens again,
      // it does not ask for the terms a second time (item 6).
      session.update(result.data);
      setTermsDone(true);
      return null;
    }
    if (result.error.code === "legal_version_outdated") {
      // Show the new versions and ask again.
      setAccepted(false);
      terms.reload();
    }
    return errorText(t, result);
  }

  return (
    <Screen>
      <SignUpProgress step={3} back={false} />
      <KeptRideCard kept={kept} compact />
      <Title>{t("onboarding.aboutYou")}</Title>
      <ProfileForm
        me={me}
        tickAppLanguage
        foldAbout
        submitLabel={t(createAccountKey(kept))}
        suggestedFirstName={suggestedFirstName}
        afterFirstName={email.field}
        check={email.check}
        beforeSave={async () => {
          const stop = (await email.send()) ?? (await acceptTerms());
          // Offered once the account is ready, as a link kept through sign-up is.
          if (stop === null && me.email !== null) {
            await keepPendingLinkIfNone("/onboarding/faster", now());
          }
          return stop;
        }}
        waiting={askTerms && !termsDone && terms.documents === null && terms.failure === null}
      >
        {askTerms ? (
          <Card>
            <LegalPart
              documents={terms.documents}
              askAge={askAge}
              changed={false}
              ageConfirmed={ageConfirmed}
              onAgeConfirmed={setAgeConfirmed}
              accepted={accepted}
              onAccepted={setAccepted}
            />
            {terms.failure === null ? null : (
              <View style={styles.failure}>
                <Notice message={errorText(t, terms.failure)} />
                <Button variant="secondary" label={t("common.retry")} onPress={terms.reload} />
              </View>
            )}
          </Card>
        ) : null}
      </ProfileForm>
    </Screen>
  );
}

const styles = StyleSheet.create({ failure: { gap: spacing.sm } });
