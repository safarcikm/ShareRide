import type { Booking } from "@shareride/contracts";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { otherPerson } from "@/chat/texts";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { TakesFocus } from "@/components/takes-focus";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { firstNameOf } from "@/people/texts";
import { deadlineText, reportState, type ReportState } from "./reports";

/**
 * Where the booking's report stands for the person looking at it (spec 8,
 * 3.3 to 3.5): asked to answer, with "That's right" and "That's not right",
 * each opening the answer screen; waiting for the other side or for
 * ShareRide; or decided. Nothing shows without a report, or when the
 * booking's own status already says how it ended. `announce` moves focus
 * to it when it appears or changes, as after reporting or answering, and
 * then calls `onAnnounced`, so the page can stop announcing it.
 */
export function ReportStatus({
  booking,
  announce = false,
  onAnnounced,
}: {
  readonly booking: Booking;
  readonly announce?: boolean;
  readonly onAnnounced?: () => void;
}) {
  const report = reportState(booking, now());
  if (report === null) return null;
  return (
    <TakesFocus key={report.state} when={announce} onFocused={onAnnounced}>
      {report.state === "to_answer" ? (
        <ToAnswer booking={booking} report={report} />
      ) : (
        <ReportLine booking={booking} report={report} />
      )}
    </TakesFocus>
  );
}

function ToAnswer({
  booking,
  report,
}: {
  readonly booking: Booking;
  readonly report: Extract<ReportState, { state: "to_answer" }>;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const name = firstNameOf(t, otherPerson(booking));
  const noShow = report.kind === "no_show";
  const answer = (chosen: "agreed" | "contested") => {
    router.push({ pathname: "/bookings/[id]/answer", params: { id: booking.id, answer: chosen } });
  };
  return (
    <Card>
      <Text style={[typography.bodyStrong, { color: palette.text }]}>
        {t(noShow ? "dispute.saidNoShow" : "dispute.saidDriverAbsent", { name })}
      </Text>
      <Text style={[typography.heading, { color: palette.text }]}>{t("dispute.question")}</Text>
      <Body align="start">
        {t("dispute.answerBy", { deadline: deadlineText(t, locale, report.deadline) })}
      </Body>
      <Body align="start">
        {t(
          !noShow
            ? "dispute.ifNoAnswerDriverAbsent"
            : booking.payment === "in_person"
              ? "dispute.ifNoAnswerNoShowInPerson"
              : "dispute.ifNoAnswerNoShow",
        )}
      </Body>
      <View style={styles.answers}>
        <Button
          variant="secondary"
          label={t("dispute.agree")}
          onPress={() => {
            answer("agreed");
          }}
        />
        <Button
          variant="secondary"
          label={t("dispute.contest")}
          onPress={() => {
            answer("contested");
          }}
        />
      </View>
    </Card>
  );
}

function ReportLine({
  booking,
  report,
}: {
  readonly booking: Booking;
  readonly report: Exclude<ReportState, { state: "to_answer" }>;
}) {
  const { locale, t } = useLanguage();
  const name = firstNameOf(t, otherPerson(booking));
  const message = (() => {
    switch (report.state) {
      case "waiting":
        return t(report.kind === "no_show" ? "dispute.youMarked" : "dispute.youReported", {
          name,
          deadline: deadlineText(t, locale, report.deadline),
        });
      case "too_late":
        return t("dispute.windowClosed");
      case "contested":
        return report.byViewer ? t("dispute.youContest") : t("dispute.theyContest", { name });
      case "decided":
        return t("dispute.decided");
      case "stood":
        return t(report.kind === "no_show" ? "dispute.noShowStands" : "dispute.cancelledAsIfByYou");
    }
  })();
  return <Notice kind="info" urgent={false} message={message} />;
}

const styles = StyleSheet.create({
  answers: { gap: spacing.sm },
});
