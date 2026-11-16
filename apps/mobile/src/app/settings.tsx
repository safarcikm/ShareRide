import { updateMeRoute, type Me } from "@shareride/contracts";
import { formatPhoneNumber } from "@shareride/domain";
import type { Locale } from "@shareride/i18n";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { LanguageSwitch } from "@/components/language-switch";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { BackToMenu } from "@/navigation/back-to-menu";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Settings (spec 1, section 3.8): Your account, with the private phone
 * number (spec 16, 3.4) and the email (plan 4.6), language, legal
 * documents, and signing out here or on every device. Signed out, it
 * closes back to the menu.
 */
export default function SettingsScreen() {
  const me = useMe();
  if (me === null) return <BackToMenu />;
  return <Settings me={me} />;
}

function Settings({ me }: { readonly me: Me }) {
  const { t } = useLanguage();
  const session = useSession();
  const palette = usePalette();
  const [signingOut, setSigningOut] = useState<"one" | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signOut(all: boolean) {
    setSigningOut(all ? "all" : "one");
    setError(null);
    // Once signed out, the signed-in screens close. Otherwise the person
    // stays here and can try again.
    const result = await session.signOut({ all });
    if (!result.ok && session.state().status === "signedIn") {
      setSigningOut(null);
      setError(errorText(t, result));
    }
  }

  async function saveLanguage(locale: Locale) {
    setError(null);
    // The account's language is the one used for texts sent to the person.
    const result = await session.call(updateMeRoute, { body: { locale } });
    if (result.ok) session.update(result.data);
    else setError(errorText(t, result));
  }

  const heading = (text: string, align: "center" | "start" = "center") => (
    <Text
      accessibilityRole="header"
      style={[typography.label, align === "center" && styles.centre, { color: palette.text }]}
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
      {/* Its rows start at the left (spec 16, 3.8); the other groups follow with proposal 6. */}
      <View style={styles.section}>
        {heading(t("settings.yourAccount"), "start")}
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
      </View>
      <View style={styles.section}>
        {heading(t("settings.language"))}
        <LanguageSwitch onSwitch={(locale) => void saveLanguage(locale)} />
      </View>
      <View style={styles.section}>
        {heading(t("settings.legal"))}
        <TextLink label={t("legal.readTerms")} href="/legal/terms" />
        <TextLink label={t("legal.readRules")} href="/legal/community-rules" />
        <TextLink label={t("legal.readPrivacy")} href="/legal/privacy" />
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
        <Notice message={error} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.md },
  item: { gap: spacing.xs },
  centre: { textAlign: "center" },
});
