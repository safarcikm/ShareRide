import { peopleColourOf } from "@shareride/domain";
import { StyleSheet, Text, View } from "react-native";
import { useMe } from "@/auth/session";
import { Avatar } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { dayOf } from "@/lib/days";
import { languagesText } from "@/people/languages";
import { memberSinceText } from "@/people/texts";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * See it as others do (spec 16, 3.4 item 1): my public profile (spec 1),
 * never the phone number.
 */
export default function ProfilePreviewScreen() {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const me = useMe();
  if (me === null) return null;
  const firstName = me.firstName ?? "";
  const languages = languagesText(me, locale);
  return (
    <Screen>
      <BackButton fallback="/profile" />
      <Title>{t("preview.title")}</Title>
      <Body>{t("preview.intro")}</Body>
      <Card>
        <View style={styles.person}>
          <Avatar firstName={firstName} colour={peopleColourOf(me.id)} />
          <View style={styles.grow}>
            <Text style={[typography.bodyStrong, { color: palette.text }]}>{firstName}</Text>
            {languages === "" ? null : (
              <Text style={[typography.small, { color: palette.textMuted }]}>
                {t("profile.speaks", { languages })}
              </Text>
            )}
            <Text style={[typography.small, { color: palette.textMuted }]}>
              {memberSinceText(t, locale, dayOf(new Date(me.memberSince)))}
            </Text>
          </View>
        </View>
        {me.about === null || me.about === "" ? null : <Body align="start">{me.about}</Body>}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  grow: { flex: 1, gap: spacing.xs },
});
