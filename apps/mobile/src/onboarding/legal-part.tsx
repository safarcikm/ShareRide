import type { CallFailure, CallResult } from "@shareride/api-client";
import {
  acceptLegalRoute,
  currentLegalDocumentRoute,
  type LegalDocument,
} from "@shareride/contracts";
import { acceptableDocumentTypes, type AcceptableDocumentType } from "@shareride/domain";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { useSession } from "@/auth/session";
import { Checkbox } from "@/components/checkbox";
import { Body } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { spacing } from "@/theme/tokens";

// The terms part of signing up (spec 1, 3.4): on its own when the terms
// change later, and inside step 3 for a new account (spec 16, 3.5). The
// person confirms their age once and accepts the current Terms and
// Community Rules; the versions accepted are the ones shown. The Privacy
// Policy is linked, not accepted.

/** A document the person accepts, as shown to them. */
export type ShownDocument = LegalDocument & { readonly type: AcceptableDocumentType };

export interface CurrentDocuments {
  /** Null while loading or after a failure. */
  readonly documents: readonly ShownDocument[] | null;
  readonly failure: CallFailure | null;
  readonly reload: () => void;
  /** Accepts the documents shown, confirming the age when `confirmAge`. */
  readonly accept: (
    documents: readonly ShownDocument[],
    confirmAge: boolean,
  ) => Promise<CallResult<typeof acceptLegalRoute>>;
}

/** Loads the current documents to accept, in the app's language, unless `needed` is false. */
export function useCurrentDocuments(needed = true): CurrentDocuments {
  const { locale } = useLanguage();
  const session = useSession();
  const load = useCallback(async (): Promise<
    { readonly ok: true; readonly documents: readonly ShownDocument[] } | CallFailure | null
  > => {
    if (!needed) return null;
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
  }, [session, locale, needed]);
  const { value, reload } = useLoaded(load);
  return {
    documents: value?.ok === true ? value.documents : null,
    failure: value?.ok === false ? value : null,
    reload,
    accept: (documents, confirmAge) =>
      session.call(acceptLegalRoute, {
        body: {
          ...(confirmAge ? { ageConfirmed: true as const } : {}),
          documents: documents.map(({ type, version }) => ({ type, version })),
          locale,
        },
      }),
  };
}

/**
 * Links to read the Terms and the Community Rules with the versions shown
 * (and what changed, when `changed`), the age and acceptance tick boxes,
 * and the line on the Privacy Policy with its link.
 */
export function LegalPart({
  documents,
  askAge,
  changed,
  ageConfirmed,
  onAgeConfirmed,
  accepted,
  onAccepted,
}: {
  readonly documents: readonly ShownDocument[] | null;
  readonly askAge: boolean;
  readonly changed: boolean;
  readonly ageConfirmed: boolean;
  readonly onAgeConfirmed: (checked: boolean) => void;
  readonly accepted: boolean;
  readonly onAccepted: (checked: boolean) => void;
}) {
  const { t } = useLanguage();
  return (
    <View style={styles.part}>
      <View style={styles.documents}>
        <TextLink label={t("legal.readTerms")} href="/legal/terms" />
        <TextLink label={t("legal.readRules")} href="/legal/community-rules" />
        {documents?.map((document) => (
          <Body key={document.type}>
            {t("legal.documentVersion", { title: document.title, version: document.version })}
            {changed ? `. ${document.summary}` : ""}
          </Body>
        ))}
      </View>
      {askAge ? (
        <Checkbox label={t("legal.ageConfirm")} checked={ageConfirmed} onChange={onAgeConfirmed} />
      ) : null}
      <Checkbox label={t("legal.accept")} checked={accepted} onChange={onAccepted} />
      <Body>{t("legal.privacyNote")}</Body>
      <TextLink label={t("legal.readPrivacy")} href="/legal/privacy" />
    </View>
  );
}

const styles = StyleSheet.create({
  part: { gap: spacing.md },
  documents: { gap: spacing.xs },
});
