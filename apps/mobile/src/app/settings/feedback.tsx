import { myFeedbackRoute } from "@shareride/contracts";
import { formatDate } from "@shareride/i18n";
import { icelandDate } from "@shareride/domain";
import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useMe, useSession } from "@/auth/session";
import { useOpenFeedback } from "@/beta/feedback";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { BackToMenu } from "@/navigation/back-to-menu";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * My feedback (spec 12, 3.3.5), a page of Profile: what I sent, the latest
 * first, with ShareRide's reply when there is one. Only I see this list.
 * The title is at the left, with what the page is under it (spec 31,
 * 3.19).
 */
export default function MyFeedbackScreen() {
  const me = useMe();
  if (me === null) return <BackToMenu />;
  return <MyFeedback />;
}

function MyFeedback() {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const openFeedback = useOpenFeedback();
  const load = useCallback(() => session.call(myFeedbackRoute, {}), [session]);
  const { value: answer, reload } = useLoadedOnFocus(load);

  const header = (
    <ScreenHead title={t("feedback.mine")} line={t("feedback.mineHelp")} back="/profile" />
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
        <Notice message={t("feedback.mineFailed")} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </Screen>
    );
  }
  const { feedback } = answer.data;
  const day = (moment: string) => formatDate(icelandDate(new Date(moment)), locale);
  return (
    <Screen>
      {header}
      {feedback.length === 0 ? (
        <Body align="start">{t("feedback.mineNone")}</Body>
      ) : (
        feedback.map((item) => (
          <Card key={item.id}>
            <View style={styles.item}>
              <Text style={[typography.bodyStrong, { color: palette.text }]}>
                {t("feedback.mineSent", {
                  kind: t(`feedback.kind.${item.kind}`),
                  date: day(item.createdAt),
                })}
              </Text>
              <Body align="start">{item.message}</Body>
              {item.hasScreenshot ? (
                <Body align="start">{t("feedback.mineWithScreenshot")}</Body>
              ) : null}
              {item.reply === null ? (
                <Body align="start">{t("feedback.mineNoReply")}</Body>
              ) : (
                <View style={styles.reply}>
                  <Text style={[typography.bodyStrong, { color: palette.text }]}>
                    {item.repliedAt === null
                      ? t("feedback.mineReply")
                      : t("feedback.mineReplyOn", { date: day(item.repliedAt) })}
                  </Text>
                  <Body align="start">{item.reply}</Body>
                </View>
              )}
            </View>
          </Card>
        ))
      )}
      <Button variant="secondary" label={t("feedback.title")} onPress={openFeedback} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { gap: spacing.xs },
  reply: { gap: spacing.xs, marginTop: spacing.sm },
});
