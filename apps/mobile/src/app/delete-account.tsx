import { deleteAccountPage, deleteAccountSteps, pageText } from "@shareride/i18n";
import { StyleSheet, Text, View } from "react-native";
import { useMe } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { PageHead } from "@/components/page-head";
import { Screen } from "@/components/screen";
import { Heading, Title } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Delete your PuffinRide account (spec 32, section 5), open to everyone and
 * in both languages, one column: how to delete an account in the app or on
 * the website, what happens next, what is erased and what is kept, and
 * where to write. Google Play asks every app with accounts for such a page.
 * The texts come from `deleteAccountPage`, which the server also writes for
 * search engines and Google's check. Someone signed out gets Sign in;
 * someone signed in, Delete my account itself; neither is a main button,
 * as the page is for reading (spec 31, R31.1).
 */
export default function DeleteAccountScreen() {
  const { t } = useLanguage();
  const me = useMe();
  const palette = usePalette();
  const page = deleteAccountPage;
  const paragraph = (text: string) => (
    <Text style={[typography.body, { color: palette.text }]}>{text}</Text>
  );
  const item = (text: string, mark: string) => (
    <View key={text} role="listitem" style={styles.item}>
      <Text aria-hidden style={[typography.body, styles.mark, { color: palette.textMuted }]}>
        {mark}
      </Text>
      <View style={styles.itemText}>{paragraph(text)}</View>
    </View>
  );
  return (
    <Screen siteFooter>
      <PageHead {...pageText(t, { kind: "deleteAccount" })} />
      <BackButton fallback="/about" />
      <Title>{t(page.title)}</Title>
      {paragraph(t(page.intro))}
      <View style={styles.section}>
        <Heading>{t(page.howTitle)}</Heading>
        <View role="list" accessibilityLabel={t(page.howTitle)} style={styles.section}>
          {deleteAccountSteps(t).map((step, index) => (
            <View key={step} role="listitem">
              {paragraph(`${String(index + 1)}. ${step}`)}
            </View>
          ))}
        </View>
        {me === null ? (
          <Button variant="secondary" label={t("auth.signIn")} href="/sign-in" />
        ) : (
          <Button variant="secondary" label={t("privacy.delete")} href={page.deleteHref} />
        )}
      </View>
      <View style={styles.section}>
        <Heading>{t(page.afterTitle)}</Heading>
        {paragraph(t(page.after))}
      </View>
      <View style={styles.section}>
        <Heading>{t(page.erasedTitle)}</Heading>
        <View role="list" accessibilityLabel={t(page.erasedTitle)} style={styles.section}>
          {page.erased.map((key) => item(t(key), "•"))}
        </View>
      </View>
      <View style={styles.section}>
        <Heading>{t(page.keptTitle)}</Heading>
        <View role="list" accessibilityLabel={t(page.keptTitle)} style={styles.section}>
          {page.kept.map((key) => item(t(key), "•"))}
        </View>
      </View>
      <View style={styles.section}>
        <Heading>{t(page.helpTitle)}</Heading>
        {paragraph(t(page.help))}
        <TextLink label={page.email} url={`mailto:${page.email}`} align="start" />
        <TextLink
          label={t(page.privacyPolicy.label)}
          href={page.privacyPolicy.href}
          align="start"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  item: { flexDirection: "row", gap: spacing.sm },
  mark: { width: spacing.md },
  itemText: { flex: 1 },
});
