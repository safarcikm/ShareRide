import type { CallFailure } from "@shareride/api-client";
import {
  acceptLegalRoute,
  currentLegalDocumentRoute,
  type LegalDocument,
} from "@shareride/contracts";
import { acceptableDocumentTypes, type AcceptableDocumentType } from "@shareride/domain";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Checkbox } from "@/components/checkbox";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { spacing } from "@/theme/tokens";

/** A document the person accepts here, as shown to them. */
type ShownDocument = LegalDocument & { readonly type: AcceptableDocumentType };

/**
 * Terms and age (spec 1, section 3.4, screen 4). The person confirms their
 * age once and accepts the current Terms and Community Rules; the versions
 * accepted are the ones shown here. The Privacy Policy is linked, not
 * accepted. After a material change, people who already accepted see what
 * changed and accept again.
 */
export default function TermsScreen() {
  const { locale, t } = useLanguage();
  const session = useSession();
  const me = useMe();
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<
    { readonly ok: true; readonly documents: readonly ShownDocument[] } | CallFailure
  > => {
    const shown: ShownDocument[] = [];
    for (const type of acceptableDocumentTypes) {
      const result = await session.call(currentLegalDocumentRoute, {
        params: { type },
        query: { locale },
      });
      if (!result.ok) return result;
      shown.push({ ...result.data, type });
    }
    return { ok: true, documents: shown };
  }, [session, locale]);
  const { value: loaded, reload } = useLoaded(load);

  if (me === null) return null;
  const needsAge = !me.ageConfirmed;
  const documents = loaded?.ok === true ? loaded.documents : null;
  const loadFailure = loaded?.ok === false ? loaded : null;

  async function accept() {
    if (documents === null) return;
    if (!accepted || (needsAge && !ageConfirmed)) {
      setError(t("legal.needBoth"));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await session.call(acceptLegalRoute, {
      body: {
        ...(needsAge ? { ageConfirmed: true as const } : {}),
        documents: documents.map(({ type, version }) => ({ type, version })),
        locale,
      },
    });
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
      <View style={styles.documents}>
        <TextLink label={t("legal.readTerms")} href="/legal/terms" />
        <TextLink label={t("legal.readRules")} href="/legal/community-rules" />
        {documents?.map((document) => (
          <Body key={document.type}>
            {t("legal.documentVersion", { title: document.title, version: document.version })}
            {needsAge ? "" : `. ${document.summary}`}
          </Body>
        ))}
      </View>
      {needsAge ? (
        <Checkbox label={t("legal.ageConfirm")} checked={ageConfirmed} onChange={setAgeConfirmed} />
      ) : null}
      <Checkbox label={t("legal.accept")} checked={accepted} onChange={setAccepted} />
      <Body>{t("legal.privacyNote")}</Body>
      <TextLink label={t("legal.readPrivacy")} href="/legal/privacy" />
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

const styles = StyleSheet.create({ documents: { gap: spacing.xs } });
