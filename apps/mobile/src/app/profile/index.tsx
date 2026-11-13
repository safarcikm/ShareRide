import { formatPhoneNumber, spokenLanguages } from "@shareride/domain";
import { languageNames } from "@shareride/i18n";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useMe } from "@/auth/session";
import { Button } from "@/components/button";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

const isSpokenLanguage = (code: string): code is (typeof spokenLanguages)[number] =>
  spokenLanguages.some((known) => known === code);

/** My profile (spec 1, screen 6): what others see, and the private phone number. */
export default function MyProfileScreen() {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const me = useMe();
  if (me === null) return null;
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
        <Text style={[typography.title, styles.name, { color: palette.text }]}>{me.firstName}</Text>
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
    </Screen>
  );
}

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.field}>
      <Text style={[typography.label, { color: palette.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { fontSize: 22, lineHeight: 28 },
  field: { gap: spacing.xs },
});
