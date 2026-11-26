import { aboutPage, pageText } from "@shareride/i18n";
import { StyleSheet, Text, View } from "react-native";
import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { PageHead } from "@/components/page-head";
import { Row } from "@/components/row";
import { Screen } from "@/components/screen";
import { Heading, Title } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { puffinRideFacebookPage } from "@/sharing/links";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * About PuffinRide (spec 30, 3.1), open to everyone: what PuffinRide is,
 * the legal documents, who runs it and how to reach us, from `aboutPage`,
 * which the server also writes for search engines that do not run the
 * app. It takes the place of "Terms, rules and privacy" (3.2). Every link
 * is a real one: the documents and Carpool in Iceland open in the app, the
 * address writes an email, and our Facebook Page opens in the browser.
 */
export default function AboutScreen() {
  const { t } = useLanguage();
  const palette = usePalette();
  const paragraph = (text: string) => (
    <Text style={[typography.body, { color: palette.text }]}>{text}</Text>
  );
  return (
    <Screen siteFooter>
      <PageHead {...pageText(t, { kind: "about" })} />
      <BackButton fallback="/profile" />
      <Title>{t(aboutPage.title)}</Title>
      <View style={styles.section}>
        {aboutPage.intro.map((key) => (
          <View key={key}>{paragraph(t(key))}</View>
        ))}
        <TextLink
          label={t(aboutPage.howItWorks.label)}
          href={aboutPage.howItWorks.href}
          align="start"
        />
      </View>
      <View style={styles.section}>
        <Heading>{t(aboutPage.documentsTitle)}</Heading>
        <Card>
          {aboutPage.documents.map((document) => (
            <Row key={document.href} title={t(document.label)} href={document.href} />
          ))}
        </Card>
      </View>
      <View style={styles.section}>
        <Heading>{t(aboutPage.operatorTitle)}</Heading>
        {paragraph(t(aboutPage.operator))}
      </View>
      <View style={styles.section}>
        <Heading>{t(aboutPage.contactTitle)}</Heading>
        {paragraph(t(aboutPage.contact))}
        <TextLink label={aboutPage.email} url={`mailto:${aboutPage.email}`} align="start" />
        <TextLink label={t("about.facebook")} url={puffinRideFacebookPage} align="start" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ section: { gap: spacing.sm } });
