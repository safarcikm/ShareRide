import { aboutCo2Values, aboutPage, pageText } from "@shareride/i18n";
import { useEffect, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { AboutApp } from "@/app-promotion/about-app";
import { useConfig } from "@/beta/config";
import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { PageHead } from "@/components/page-head";
import { Row } from "@/components/row";
import { Screen } from "@/components/screen";
import { Heading, Title } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { puffinRideFacebookPage, puffinRideInstagram } from "@/sharing/links";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * About PuffinRide (spec 30, 3.1), open to everyone: what PuffinRide is,
 * the legal documents and how to delete an account (spec 32, section 5),
 * who runs it and how to reach us, from `aboutPage`,
 * which the server also writes for search engines that do not run the
 * app. It takes the place of "Terms, rules and privacy" (3.2). Every link
 * is a real one: the documents and Carpool in Iceland open in the app, the
 * address writes an email, and our Facebook Page and Instagram open in the
 * browser.
 */
export default function AboutScreen() {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const gramsPerCarKm = useConfig().co2GramsPerCarKm;
  const co2Values = aboutCo2Values(gramsPerCarKm, locale);
  useScrollToAnchor("co2", gramsPerCarKm > 0);
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
      {/* What a shared ride saves (spec 34, 3.9), with the operator's value;
          not there while it is 0. Its heading has no "CO₂", which Fredoka
          cannot write. */}
      {gramsPerCarKm === 0 ? null : (
        <View style={styles.section}>
          <Heading anchor="co2">{t(aboutPage.co2.title)}</Heading>
          {aboutPage.co2.paragraphs.map((key) => (
            <View key={key}>{paragraph(t(key, co2Values))}</View>
          ))}
        </View>
      )}
      {/* The phone apps, on the website while a store's page is public (spec 35, 3.6). */}
      <AboutApp />
      <View style={styles.section}>
        <Heading>{t(aboutPage.documentsTitle)}</Heading>
        <Card>
          {aboutPage.documents.map((document) => (
            <Row key={document.href} title={t(document.label)} href={document.href} />
          ))}
        </Card>
        <TextLink
          label={t(aboutPage.deleteAccount.label)}
          href={aboutPage.deleteAccount.href}
          align="start"
        />
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
        <TextLink label={t("about.instagram")} url={puffinRideInstagram} align="start" />
      </View>
    </Screen>
  );
}

/**
 * On the web, an address ending in `#co2` (a card's "How we estimate it",
 * or a shared link) brings that section into view once it is shown: the
 * section waits for the settings, and the screen scrolls inside its own
 * view, so the browser does not do it by itself. Focus goes to it too, so
 * the keyboard and a screen reader go on from there. Screens opened earlier
 * stay in the page, hidden, so it takes the one on show.
 */
function useScrollToAnchor(anchor: string, shown: boolean) {
  const done = useRef(false);
  useEffect(() => {
    if (Platform.OS !== "web" || !shown || done.current) return;
    if (window.location.hash !== `#${anchor}`) return;
    done.current = true;
    const target = [...document.querySelectorAll(`[id="${anchor}"]`)]
      .reverse()
      .find((element) => element.getClientRects().length > 0);
    if (!(target instanceof HTMLElement)) return;
    target.scrollIntoView({ block: "start" });
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }, [anchor, shown]);
}

const styles = StyleSheet.create({ section: { gap: spacing.sm } });
