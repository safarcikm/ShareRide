import { myReportsRoute, type MyReport } from "@shareride/contracts";
import { formatDate, type MessageKey } from "@shareride/i18n";
import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useMe, useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { BackToMenu } from "@/navigation/back-to-menu";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { categoryKeys } from "@/safety/report-texts";

const kindKeys = {
  trip: "reports.kind.trip",
  message: "reports.kind.message",
  booking: "reports.kind.booking",
  user: "reports.kind.user",
  review: "reports.kind.review",
} as const satisfies Record<MyReport["kind"], MessageKey>;

/** What became of a report, in general terms (spec 9, 3.1.6). */
const outcomeKey = (report: MyReport): MessageKey => {
  switch (report.outcome) {
    case "action_taken":
      return "report.outcomeAction";
    case "no_breach":
      return "report.outcomeNone";
    case null:
      return "report.open";
  }
};

/**
 * My reports (spec 9, 3.1.7), in Settings under Safety: what I reported,
 * when, and what ShareRide found, the latest first. Only I see this list.
 */
export default function ReportsScreen() {
  const me = useMe();
  if (me === null) return <BackToMenu />;
  return <Reports />;
}

function Reports() {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const load = useCallback(() => session.call(myReportsRoute, {}), [session]);
  const { value: answer, reload } = useLoaded(load);

  const header = (
    <>
      <BackButton fallback="/settings" />
      <Title>{t("reports.title")}</Title>
      <Body>{t("reports.help")}</Body>
    </>
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
        <Notice message={t("reports.failed")} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </Screen>
    );
  }
  const { reports } = answer.data;
  return (
    <Screen>
      {header}
      {reports.length === 0 ? (
        <Body>{t("reports.none")}</Body>
      ) : (
        reports.map((report) => (
          <Card key={report.id}>
            <View style={styles.report}>
              <Text style={[typography.bodyStrong, { color: palette.text }]}>
                {t(kindKeys[report.kind], {
                  name: report.firstName ?? t("reports.formerMember"),
                })}
              </Text>
              <Text style={[typography.small, { color: palette.textMuted }]}>
                {`${t(categoryKeys[report.category])} · ${t("reports.sent", {
                  // With the year: a report is kept for years (Iceland keeps UTC).
                  date: formatDate(report.filedAt.slice(0, 10), locale),
                })}`}
              </Text>
              <Text style={[typography.body, { color: palette.text }]}>
                {t(outcomeKey(report))}
              </Text>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  report: { gap: spacing.xs },
});
