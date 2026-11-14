import { updateMeRoute } from "@shareride/contracts";
import type { Locale } from "@shareride/i18n";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { LanguageSwitch } from "@/components/language-switch";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Settings (spec 1, section 3.8), milestone 1 part: language, legal
 * documents, and signing out here or on every device. Signing out closes
 * the signed-in screens.
 */
export default function SettingsScreen() {
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

  const heading = (text: string) => (
    <Text
      accessibilityRole="header"
      style={[typography.label, styles.centre, { color: palette.text }]}
    >
      {text}
    </Text>
  );

  return (
    <Screen>
      <BackButton fallback="/profile" />
      <Title>{t("settings.title")}</Title>
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
  centre: { textAlign: "center" },
});
