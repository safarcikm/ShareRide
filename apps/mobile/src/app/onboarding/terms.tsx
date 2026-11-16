import { useState } from "react";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { LegalPart, useCurrentDocuments } from "@/onboarding/legal-part";

/**
 * The terms on their own (spec 1, section 3.4, screen 4), for an account
 * whose only step left is the terms: after a material change, people who
 * already accepted see what changed and accept again (spec 16, 3.5 item 5).
 * A new account accepts them in step 3, about you.
 */
export default function TermsScreen() {
  const { t } = useLanguage();
  const session = useSession();
  const me = useMe();
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const {
    documents,
    failure: loadFailure,
    reload,
    accept: acceptDocuments,
  } = useCurrentDocuments();

  if (me === null) return null;
  const needsAge = !me.ageConfirmed;

  async function accept() {
    if (documents === null) return;
    if (!accepted || (needsAge && !ageConfirmed)) {
      setError(t("legal.needBoth"));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await acceptDocuments(documents, needsAge);
    setBusy(false);
    if (result.ok) {
      // The terms close and the app goes on to the next step (_layout.tsx).
      session.update(result.data);
      return;
    }
    setError(errorText(t, result));
    if (result.error.code === "legal_version_outdated") {
      // Show the new versions and ask again.
      setAccepted(false);
      reload();
    }
  }

  return (
    <Screen>
      <Title>{needsAge ? t("legal.title") : t("legal.changedTitle")}</Title>
      <Body>{t("legal.intro")}</Body>
      <LegalPart
        documents={documents}
        askAge={needsAge}
        changed={!needsAge}
        ageConfirmed={ageConfirmed}
        onAgeConfirmed={setAgeConfirmed}
        accepted={accepted}
        onAccepted={setAccepted}
      />
      <Notice message={loadFailure === null ? error : errorText(t, loadFailure)} />
      {loadFailure === null ? (
        <Button
          label={t("legal.continue")}
          busy={busy || documents === null}
          onPress={() => void accept()}
        />
      ) : (
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      )}
    </Screen>
  );
}
