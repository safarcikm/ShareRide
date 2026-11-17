import { answerDisputeRoute, type Booking, type Dispute } from "@shareride/contracts";
import { disputeNoteMaxLength, type DisputeAnswer } from "@shareride/domain";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { otherPerson } from "@/chat/texts";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { TextField } from "@/components/text-field";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import {
  backTo,
  BookingLine,
  Changed,
  NotLoaded,
  noteBody,
  noteError,
  useReportBooking,
} from "./report-screen";
import { reportState } from "./reports";

const isAnswer = (value: string | undefined): value is DisputeAnswer =>
  value === "agreed" || value === "contested";

/**
 * Answering a report about you (spec 8, screen 5): "That's right" or
 * "That's not right", chosen on the booking or the trip and changeable
 * here, with what each does and an optional note only ShareRide reads.
 * Done, it goes back to the booking or the trip, where focus moves to
 * what the answer did.
 */
export function AnswerScreen() {
  const { t } = useLanguage();
  const { answer: given } = useLocalSearchParams<{ answer?: string }>();
  const { id, value: answer, reload } = useReportBooking();
  if (answer === undefined || !answer.ok) {
    return <NotLoaded id={id} title={t("dispute.question")} answer={answer} onRetry={reload} />;
  }
  const booking = answer.data;
  const report = reportState(booking, now());
  if (booking.dispute === null || report?.state !== "to_answer") {
    return (
      <Screen>
        <BackButton fallback={backTo(booking)} />
        <Title>{t("dispute.question")}</Title>
        {report?.state === "too_late" ? (
          <Notice message={t("dispute.windowClosed")} />
        ) : (
          <Changed booking={booking} />
        )}
      </Screen>
    );
  }
  return (
    <AnswerForm
      booking={booking}
      dispute={booking.dispute}
      given={isAnswer(given) ? given : null}
    />
  );
}

function AnswerForm({
  booking,
  dispute,
  given,
}: {
  readonly booking: Booking;
  readonly dispute: Dispute;
  /** The answer chosen on the page before, if any. */
  readonly given: DisputeAnswer | null;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [chosen, setChosen] = useState<DisputeAnswer | null>(given);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const name = otherPerson(booking).firstName;
  const noShow = dispute.kind === "no_show";
  const problem = noteError(t, note);

  const send = async () => {
    if (chosen === null) {
      setNotice(t("dispute.chooseAnswer"));
      return;
    }
    if (problem !== undefined) {
      setNotice(problem);
      return;
    }
    setNotice(null);
    setBusy(true);
    const answer = await session.call(answerDisputeRoute, {
      params: { id: dispute.id },
      body: { answer: chosen, ...noteBody(note) },
    });
    setBusy(false);
    if (answer.ok) {
      router.dismissTo(backTo(booking, true));
      return;
    }
    switch (answer.error.code) {
      case "answer_window_closed":
        setNotice(t("dispute.windowClosed"));
        return;
      case "already_answered":
      case "already_decided":
      case "not_found":
        setChanged(true);
        return;
      case "validation_failed":
        setNotice(t("trip.note.tooLong", { max: disputeNoteMaxLength }));
        return;
      default:
        setNotice(errorText(t, answer));
    }
  };

  const head = (
    <>
      <BackButton fallback={backTo(booking)} />
      <View>
        <BookingLine booking={booking} />
        <Title align="start">{t("dispute.question")}</Title>
      </View>
    </>
  );
  if (changed) {
    return (
      <Screen>
        {head}
        <TakesFocus>
          <Changed booking={booking} />
        </TakesFocus>
      </Screen>
    );
  }

  const options = [
    { answer: "agreed", label: t("dispute.agree") },
    { answer: "contested", label: t("dispute.contest") },
  ] as const;
  return (
    <Screen
      footer={
        <Button
          main
          busy={busy}
          label={t("dispute.send")}
          onPress={() => {
            void send();
          }}
        />
      }
    >
      {head}
      <Text style={[typography.bodyStrong, { color: palette.text }]}>
        {t(noShow ? "dispute.saidNoShow" : "dispute.saidDriverAbsent", { name })}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t("dispute.question")}
        style={styles.chips}
      >
        {options.map((option) => (
          <Chip
            key={option.answer}
            role="radio"
            label={option.label}
            selected={chosen === option.answer}
            onToggle={() => {
              setNotice(null);
              setChosen(option.answer);
            }}
          />
        ))}
      </View>
      {chosen === null ? null : (
        <Card>
          <Body align="start">
            {chosen === "contested"
              ? t("dispute.contestThen")
              : noShow
                ? t("dispute.agreeNoShow")
                : t("dispute.agreeDriverAbsent", { name })}
          </Body>
        </Card>
      )}
      <TextField
        label={t("dispute.answerNote")}
        value={note}
        onChangeText={(text) => {
          setNotice(null);
          setNote(text);
        }}
        multiline
        maxLength={disputeNoteMaxLength * 2}
        help={t("report.noteHelp", { max: disputeNoteMaxLength })}
        error={problem}
      />
      {notice === null ? null : (
        <TakesFocus key={notice}>
          <Notice message={notice} />
        </TakesFocus>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
