import { answerDisputeRoute, type Booking, type Dispute } from "@shareride/contracts";
import { disputeNoteMaxLength, type DisputeAnswer } from "@shareride/domain";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { otherPerson } from "@/chat/texts";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { ActionNotice, Notice, useSaid } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { TextField } from "@/components/text-field";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { firstNameOf } from "@/people/texts";
import {
  backTo,
  BookingHead,
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
 * Answering a report about you (spec 8, screen 5): the title over the ride
 * as a ticket (spec 31, 3.19), then "That's right" or "That's not right",
 * chosen on the booking or the trip and changeable here, with what each
 * does and an optional note only ShareRide reads. "Send answer" is the
 * main button, in the bar, with why it sent nothing over it. Done, it goes
 * back to the booking or the trip, where focus moves to what the answer
 * did.
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
        <BookingHead booking={booking} title={t("dispute.question")} />
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
  const [notice, say] = useSaid();
  const [changed, setChanged] = useState(false);
  const name = firstNameOf(t, otherPerson(booking));
  const noShow = dispute.kind === "no_show";
  // Paid to the driver in person (rule M6): no refund either way.
  const inPerson = booking.payment === "in_person";
  const problem = noteError(t, note);

  const send = async () => {
    if (chosen === null) {
      say(t("dispute.chooseAnswer"));
      return;
    }
    if (problem !== undefined) {
      say(problem);
      return;
    }
    say(null);
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
        say(t("dispute.windowClosed"));
        return;
      case "already_answered":
      case "already_decided":
      case "not_found":
        setChanged(true);
        return;
      case "validation_failed":
        say(t("trip.note.tooLong", { max: disputeNoteMaxLength }));
        return;
      default:
        say(errorText(t, answer));
    }
  };

  const head = <BookingHead booking={booking} title={t("dispute.question")} />;
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
        <>
          <ActionNotice says={notice} />
          <Button
            main
            busy={busy}
            label={t("dispute.send")}
            onPress={() => {
              void send();
            }}
          />
        </>
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
              say(null);
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
                ? t(inPerson ? "dispute.agreeNoShowInPerson" : "dispute.agreeNoShow")
                : booking.total.amount === 0 || inPerson
                  ? t("dispute.agreeDriverAbsentFree")
                  : t("dispute.agreeDriverAbsent", { name })}
          </Body>
        </Card>
      )}
      <TextField
        label={t("dispute.answerNote")}
        value={note}
        onChangeText={(text) => {
          say(null);
          setNote(text);
        }}
        multiline
        maxLength={disputeNoteMaxLength * 2}
        help={t("report.noteHelp", { max: disputeNoteMaxLength })}
        error={problem}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
