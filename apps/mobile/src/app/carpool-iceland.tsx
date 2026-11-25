import { carpoolPage, pageText } from "@shareride/i18n";
import { StyleSheet, Text, View } from "react-native";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { PageHead } from "@/components/page-head";
import { PuffinsInCar } from "@/components/puffin-scenes";
import { Screen } from "@/components/screen";
import { Heading, sectionLevel, Title } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Carpool in Iceland (spec 23, 3.9), open to everyone: what PuffinRide is
 * and how carpooling with it works, in words, for people who search for
 * it. Find a ride and Offer a ride under the line, then the page's sections
 * from `carpoolPage`, which the server also writes for search engines that
 * do not run the app. Every link is a real one (3.6, item 6).
 */
export default function CarpoolIcelandScreen() {
  const { t } = useLanguage();
  const palette = usePalette();
  const paragraph = (text: string) => (
    <Text style={[typography.body, { color: palette.text }]}>{text}</Text>
  );
  return (
    <Screen>
      <PageHead {...pageText(t, { kind: "carpool" })} />
      <BackButton fallback="/" />
      <View style={styles.picture}>
        <PuffinsInCar width={sizes.sceneCarBooked} />
      </View>
      <Title>{t(carpoolPage.title)}</Title>
      <Text style={[typography.body, styles.intro, { color: palette.text }]}>
        {t(carpoolPage.intro)}
      </Text>
      <View style={styles.actions}>
        <Button label={t("welcome.findRide")} href="/" fill />
        <Button variant="secondary" label={t("driver.offerRide")} href="/offer" fill />
      </View>
      {carpoolPage.sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Heading>{t(section.heading)}</Heading>
          {section.paragraphs.map((key) => (
            <View key={key}>{paragraph(t(key))}</View>
          ))}
          {(section.questions ?? []).map(({ question, answer }) => (
            <View key={question} style={styles.question}>
              <Text
                accessibilityRole="header"
                {...questionLevel}
                style={[typography.label, { color: palette.text }]}
              >
                {t(question)}
              </Text>
              {paragraph(t(answer))}
            </View>
          ))}
          {section.link === undefined ? null : (
            <TextLink label={t(section.link.label)} href={section.link.href} align="start" />
          )}
        </View>
      ))}
    </Screen>
  );
}

/** A question is a heading under its section's: an h3 on the web. */
const questionLevel: object = "aria-level" in sectionLevel ? { "aria-level": 3 } : {};

const styles = StyleSheet.create({
  picture: { alignItems: "center" },
  intro: { textAlign: "center" },
  actions: { gap: spacing.sm },
  section: { gap: spacing.sm },
  question: { gap: spacing.xs },
});
