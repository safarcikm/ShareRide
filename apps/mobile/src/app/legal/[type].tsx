import { currentLegalDocumentRoute } from "@shareride/contracts";
import { legalDocumentTypes, type LegalDocumentType } from "@shareride/domain";
import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, Text } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Loading } from "@/components/loading";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

const isDocumentType = (type: unknown): type is LegalDocumentType =>
  legalDocumentTypes.some((known) => known === type);

/** The current version of a legal document, in the app language. Open to everyone. */
export default function LegalDocumentScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const { locale, t } = useLanguage();
  const session = useSession();
  const load = useCallback(
    () =>
      isDocumentType(type)
        ? session.call(currentLegalDocumentRoute, { params: { type }, query: { locale } })
        : Promise.resolve(null),
    [type, locale, session],
  );
  const { value: result, reload } = useLoaded(load);

  return (
    <Screen>
      <BackButton />
      {result === undefined ? (
        <Loading />
      ) : result === null || !result.ok ? (
        <>
          <Notice message={result === null ? t("error.generic") : errorText(t, result)} />
          <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        </>
      ) : (
        <>
          <Title>{result.data.title}</Title>
          <Body>{t("legal.version", { version: result.data.version })}</Body>
          <Markdown text={result.data.body} />
        </>
      )}
    </Screen>
  );
}

/** Text with **bold** parts. */
function Inline({ text }: { readonly text: string }) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, index) =>
    index % 2 === 1 ? (
      <Text key={index} style={styles.bold}>
        {part}
      </Text>
    ) : (
      part
    ),
  );
}

/**
 * The few Markdown features legal texts use: headings, paragraphs and bold.
 * Anything else shows as plain text.
 */
function Markdown({ text }: { readonly text: string }) {
  const palette = usePalette();
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== "");
  return blocks.map((block, index) => {
    const heading = /^#{1,6}\s+(.*)$/.exec(block);
    if (heading?.[1] !== undefined) {
      return (
        <Text
          key={index}
          accessibilityRole="header"
          style={[typography.label, { color: palette.text }]}
        >
          <Inline text={heading[1]} />
        </Text>
      );
    }
    return (
      <Body key={index}>
        <Inline text={block} />
      </Body>
    );
  });
}

const styles = StyleSheet.create({ bold: { fontFamily: typography.bodyStrong.fontFamily } });
