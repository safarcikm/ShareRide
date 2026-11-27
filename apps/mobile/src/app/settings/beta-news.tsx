import { myAnnouncementsRoute } from "@shareride/contracts";
import { icelandDate } from "@shareride/domain";
import { formatDate } from "@shareride/i18n";
import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useMe, useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { Body, sectionLevel } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { BackToMenu } from "@/navigation/back-to-menu";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Beta news (spec 10, 3.5; plan 4.7), opened from Notifications: PuffinRide's
 * announcements sent to me, the latest first, in the app's language. A
 * push about one opens this page, and it is where someone without an
 * email address reads them. The title is at the left, with what the page
 * is under it (spec 31, 3.19).
 */
export default function BetaNewsScreen() {
  const me = useMe();
  if (me === null) return <BackToMenu />;
  return <BetaNews />;
}

function BetaNews() {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const load = useCallback(() => session.call(myAnnouncementsRoute, {}), [session]);
  const { value: answer, reload } = useLoadedOnFocus(load);

  const header = (
    <ScreenHead
      title={t("betaNews.title")}
      line={t("betaNews.help")}
      back="/settings/notifications"
    />
  );
  if (answer === undefined) {
    return (
      <Screen>
        {header}
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!answer.ok) {
    return (
      <Screen>
        {header}
        <Notice message={t("betaNews.failed")} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </Screen>
    );
  }
  const { announcements } = answer.data;
  return (
    <Screen>
      {header}
      {announcements.length === 0 ? (
        <Body align="start">{t("betaNews.none")}</Body>
      ) : (
        announcements.map((item) => (
          <Card key={item.id}>
            <View style={styles.item}>
              <Text
                accessibilityRole="header"
                {...sectionLevel}
                style={[typography.bodyStrong, { color: palette.text }]}
              >
                {locale === "is" ? item.titleIs : item.titleEn}
              </Text>
              <Body align="start">{formatDate(icelandDate(new Date(item.sentAt)), locale)}</Body>
              <Body align="start">{locale === "is" ? item.messageIs : item.messageEn}</Body>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { gap: spacing.xs },
});
