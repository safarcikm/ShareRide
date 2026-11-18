import { driverReadinessRoute, type Me } from "@shareride/contracts";
import { peopleColourOf } from "@shareride/domain";
import { router } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useMe, useSession } from "@/auth/session";
import { Avatar } from "@/components/avatar";
import { useOpenFeedback } from "@/beta/feedback";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { LanguageSwitch } from "@/components/language-switch";
import { Row } from "@/components/row";
import { Screen } from "@/components/screen";
import { Title } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { useSaveLanguage } from "@/i18n/use-save-language";
import { dayOf } from "@/lib/days";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { SignInFirst } from "@/navigation/sign-in-first";
import { languagesText } from "@/people/languages";
import { memberSinceText } from "@/people/texts";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Profile, a place of the menu (spec 16, 3.1). Signed in, my profile
 * (spec 16, 3.4): who I am, then rows for my cars, my licence, the meeting
 * points, Settings and the legal documents. Signed out: Sign in, the
 * language, the meeting points and the legal documents.
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
  const { t } = useLanguage();
  const session = useSession();
  const openFeedback = useOpenFeedback();
  const load = useCallback(() => session.call(driverReadinessRoute, {}), [session]);
  const { value: readiness } = useLoadedOnFocus(load);
  // Without an answer the row just leaves the value out.
  const licence =
    readiness?.ok === true
      ? readiness.data.items.find((item) => item.item === "licence")?.done
      : undefined;
  return (
    <Screen>
      <Title>{t("profile.title")}</Title>
      <Person me={me} />
      <Button
        variant="secondary"
        label={t("profile.edit")}
        onPress={() => {
          router.push("/profile/edit");
        }}
      />
      <TextLink label={t("profile.preview")} href="/profile/preview" />
      <Card>
        <Row
          title={t("profile.myCars")}
          onPress={() => {
            router.push("/drive/cars");
          }}
        />
        <Row
          title={t("driver.ready.licence")}
          value={
            licence === undefined
              ? undefined
              : t(licence ? "profile.licenceConfirmed" : "profile.licenceNotYet")
          }
          onPress={() => {
            router.push("/drive/licence");
          }}
        />
        <Row
          title={t("meetingPoints.title")}
          onPress={() => {
            router.push("/meeting-points");
          }}
        />
      </Card>
      <Card>
        <Row
          title={t("settings.open")}
          onPress={() => {
            router.push("/settings");
          }}
        />
        <Row
          title={t("profile.legal")}
          onPress={() => {
            router.push("/legal");
          }}
        />
        <Row title={t("feedback.title")} onPress={openFeedback} />
        <Row
          title={t("notices.title")}
          onPress={() => {
            router.push("/notices");
          }}
        />
      </Card>
      <Small>{t("profile.inSettings")}</Small>
    </Screen>
  );
}

/** My avatar, first name, languages and when I joined (3.4 item 1). */
function Person({ me }: { readonly me: Me }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const firstName = me.firstName ?? "";
  const languages = languagesText(me, locale);
  const summary = [
    languages === "" ? null : t("profile.speaks", { languages }),
    memberSinceText(t, locale, dayOf(new Date(me.memberSince))),
  ]
    .filter((part) => part !== null)
    .join(" · ");
  return (
    <View style={styles.person}>
      <Avatar firstName={firstName} colour={peopleColourOf(me.id)} />
      <Text style={[typography.figure, styles.centre, { color: palette.text }]}>{firstName}</Text>
      <Small centre>{summary}</Small>
    </View>
  );
}

function Small({
  children,
  centre = false,
}: {
  readonly children: string;
  readonly centre?: boolean;
}) {
  const palette = usePalette();
  return (
    <Text style={[typography.small, centre ? styles.centre : null, { color: palette.textMuted }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  person: { alignItems: "center", gap: spacing.xs },
  links: { gap: spacing.sm, paddingTop: spacing.lg },
  centre: { textAlign: "center" },
});
