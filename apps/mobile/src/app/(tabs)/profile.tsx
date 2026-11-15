import type { Me } from "@shareride/contracts";
import { formatPhoneNumber, spokenLanguages } from "@shareride/domain";
import { languageNames } from "@shareride/i18n";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useMe } from "@/auth/session";
import { Button } from "@/components/button";
import { LanguageSwitch } from "@/components/language-switch";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { useSaveLanguage } from "@/i18n/use-save-language";
import { SignInFirst } from "@/navigation/sign-in-first";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

const isSpokenLanguage = (code: string): code is (typeof spokenLanguages)[number] =>
  spokenLanguages.some((known) => known === code);

/**
 * Profile, a place of the menu (spec 16, 3.1). Signed in, my profile
 * (spec 1, screen 6): what others see, and the private phone number.
 * Signed out: Sign in, the language, the meeting points and the legal
 * documents.
 */
export default function ProfileScreen() {
  const me = useMe();
  return me === null ? <SignedOut /> : <MyProfile me={me} />;
}

function SignedOut() {
  const { t } = useLanguage();
  const saveLanguage = useSaveLanguage();
  return (
    <SignInFirst title={t("nav.profile")}>
      <View style={styles.links}>
        <LanguageSwitch onSwitch={saveLanguage} />
        <Button
          variant="text"
          label={t("meetingPoints.open")}
          onPress={() => {
            router.push("/meeting-points");
          }}
        />
        <TextLink label={t("legal.readTerms")} href="/legal/terms" />
        <TextLink label={t("legal.readRules")} href="/legal/community-rules" />
        <TextLink label={t("legal.readPrivacy")} href="/legal/privacy" />
      </View>
    </SignInFirst>
  );
}

function MyProfile({ me }: { readonly me: Me }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const languages = me.languages
    .filter(isSpokenLanguage)
    .map((code) => languageNames[locale][code])
    .join(", ");
  return (
    <Screen>
      <View style={styles.header}>
        <Title>{t("profile.title")}</Title>
        <Button
          variant="secondary"
          label={t("settings.open")}
          onPress={() => {
            router.push("/settings");
          }}
        />
      </View>
      <Field label={t("profile.firstName")}>
        <Text style={[typography.title, styles.name, styles.centre, { color: palette.text }]}>
          {me.firstName}
        </Text>
      </Field>
      <Field label={t("profile.about")}>
        <Body>{me.about ?? t("profile.noAbout")}</Body>
      </Field>
      {languages === "" ? null : (
        <Field label={t("profile.languages")}>
          <Body>{languages}</Body>
        </Field>
      )}
      {me.phoneNumber === null ? null : (
        <Field label={t("profile.phone")}>
          <Body>{formatPhoneNumber(me.phoneNumber)}</Body>
          <Body>{t("profile.phoneHelp")}</Body>
        </Field>
      )}
      <Button
        label={t("profile.edit")}
        onPress={() => {
          router.push("/profile/edit");
        }}
      />
      <Button
        variant="text"
        label={t("meetingPoints.open")}
        onPress={() => {
          router.push("/meeting-points");
        }}
      />
    </Screen>
  );
}

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.field}>
      <Text style={[typography.label, styles.centre, { color: palette.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { fontSize: 22, lineHeight: 28 },
  field: { gap: spacing.xs },
  links: { gap: spacing.sm, paddingTop: spacing.lg },
  centre: { textAlign: "center" },
});
