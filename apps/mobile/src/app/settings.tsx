import { updateMeRoute, type Me } from "@shareride/contracts";
import { formatPhoneNumber } from "@shareride/domain";
import type { Locale } from "@shareride/i18n";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { useSignOut } from "@/auth/use-sign-out";
import { useConfig } from "@/beta/config";
import { useOpenFeedback } from "@/beta/feedback";
import { ShakeSwitch } from "@/beta/shake";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Notice } from "@/components/notice";
import { Row } from "@/components/row";
import { Screen } from "@/components/screen";
import { Body, sectionLevel, Title } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { BackToMenu } from "@/navigation/back-to-menu";
import { NotificationSwitches } from "@/notifications/notification-switches";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Settings (spec 1, section 3.8; spec 16, 3.8): the language as two choices
 * side by side, Your account with the private phone number (spec 16, 3.4),
 * the email (plan 4.6), Sign-in methods once Google or Apple is set up
 * (spec 19, 3.4) and Privacy and your data (spec 11), Notifications
 * with the Trip reminders switch (spec 7, 3.6), Safety with Blocked people
 * (spec 9, 3.2), Feedback (spec 12, 3.3), legal documents, and signing out
 * here or on every device.
 * Rows start at the left. Signed out, it closes back to the menu.
 */
export default function SettingsScreen() {
  const me = useMe();
  if (me === null) return <BackToMenu />;
  return <Settings me={me} />;
}

function Settings({ me }: { readonly me: Me }) {
  const { locale, setLocale, t } = useLanguage();
  const session = useSession();
  const palette = usePalette();
  const openFeedback = useOpenFeedback();
  const { signInProviders } = useConfig();
  // Once signed out, this screen closes back to Find by itself.
  const { signingOut, error: signOutError, signOut } = useSignOut();
  const [error, setError] = useState<string | null>(null);

  async function saveLanguage(locale: Locale) {
    setError(null);
    // The account's language is the one used for texts sent to the person.
    const result = await session.call(updateMeRoute, { body: { locale } });
    if (result.ok) session.update(result.data);
    else setError(errorText(t, result));
  }

  const heading = (text: string) => (
    <Text
      accessibilityRole="header"
      {...sectionLevel}
      style={[typography.label, { color: palette.text }]}
    >
      {text}
    </Text>
  );

  const label = (text: string) => (
    <Text style={[typography.bodyStrong, { color: palette.text }]}>{text}</Text>
  );

  return (
    <Screen>
      <BackButton fallback="/profile" />
      <Title>{t("settings.title")}</Title>
      <View style={styles.section}>
        {heading(t("settings.language"))}
        <View accessibilityRole="radiogroup" aria-label={t("settings.language")} style={styles.row}>
          {(["en", "is"] as const).map((choice) => (
            <Chip
              key={choice}
              role="radio"
              label={choice === "en" ? t("language.english") : t("language.icelandic")}
              lang={choice}
              selected={locale === choice}
              onToggle={() => {
                if (choice === locale) return;
                setLocale(choice);
                void saveLanguage(choice);
              }}
            />
          ))}
        </View>
      </View>
      <View style={styles.section}>
        {heading(t("settings.yourAccount"))}
        {me.phoneNumber === null ? null : (
          <View style={styles.item}>
            {label(t("profile.phone"))}
            <Body align="start">{formatPhoneNumber(me.phoneNumber)}</Body>
            <Body align="start">{t("profile.phoneHelp")}</Body>
          </View>
        )}
        <View style={styles.item}>
          {label(t("settings.email"))}
          {me.email === null ? null : <Body align="start">{me.email}</Body>}
          {me.pendingEmail === null ? null : (
            <Body align="start">{t("settings.emailWaiting", { email: me.pendingEmail })}</Body>
          )}
          <TextLink
            label={t(me.email === null ? "settings.addEmail" : "settings.changeEmail")}
            href="/settings/email"
            align="start"
          />
        </View>
        <Card>
          {signInProviders.length === 0 ? null : (
            <Row
              title={t("settings.signInMethods")}
              onPress={() => {
                router.push("/settings/sign-in-methods");
              }}
            />
          )}
          <Row
            title={t("settings.privacy")}
            onPress={() => {
              router.push("/settings/privacy");
            }}
          />
        </Card>
      </View>
      <View style={styles.section}>
        {heading(t("settings.notifications"))}
        <NotificationSwitches />
      </View>
      <View style={styles.section}>
        {heading(t("safety.title"))}
        <Card>
          <Row
            title={t("reports.title")}
            onPress={() => {
              router.push("/settings/reports");
            }}
          />
          <Row
            title={t("blocks.title")}
            onPress={() => {
              router.push("/settings/blocked");
            }}
          />
        </Card>
      </View>
      <View style={styles.section}>
        {heading(t("feedback.heading"))}
        <Card>
          <Row title={t("feedback.title")} onPress={openFeedback} />
          <Row
            title={t("feedback.mine")}
            onPress={() => {
              router.push("/settings/feedback");
            }}
          />
        </Card>
        <ShakeSwitch />
      </View>
      <View style={styles.section}>
        {heading(t("settings.legal"))}
        <Card>
          {legalDocuments.map(({ title, href }) => (
            <Row
              key={href}
              title={t(title)}
              onPress={() => {
                router.push(href);
              }}
            />
          ))}
        </Card>
      </View>
      <View style={styles.section}>
        <Button
          variant="secondary"
          label={t("settings.signOut")}
          busy={signingOut === "one"}
          disabled={signingOut !== null}
          onPress={() => void signOut(false)}
        />
        <Button
          variant="secondary"
          label={t("settings.signOutAll")}
          busy={signingOut === "all"}
          disabled={signingOut !== null}
          onPress={() => void signOut(true)}
        />
        <Body>{t("settings.signOutAllHelp")}</Body>
        <Notice message={signOutError ?? error} />
      </View>
    </Screen>
  );
}

const legalDocuments = [
  { title: "legal.terms", href: "/legal/terms" },
  { title: "legal.rules", href: "/legal/community-rules" },
  { title: "legal.privacy", href: "/legal/privacy" },
] as const;

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.md },
  item: { gap: spacing.xs },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
