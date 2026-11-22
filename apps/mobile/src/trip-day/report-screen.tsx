import type { CallFailure, CallResult } from "@shareride/api-client";
import {
  bookingRoute,
  markNoShowRoute,
  reportDriverAbsentRoute,
  type Booking,
} from "@shareride/contracts";
import { checkDisputeNote, disputeNoteMaxLength, type DisputeKind } from "@shareride/domain";
import { capitalised, formatClock, formatDay, formatMoney, type Translate } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { otherPerson } from "@/chat/texts";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { TextField } from "@/components/text-field";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { firstNameOf } from "@/people/texts";
import { deadlineText } from "./reports";

/**
 * Where a report or an answer leads: the driver's trip, or the passenger's
 * booking. `reported` says it was sent, so the page moves focus to it.
 */
export function backTo(booking: Booking, reported = false) {
  return booking.viewer === "driver"
    ? {
        pathname: "/drive/trips/[id]",
        params: { id: booking.trip.id, ...(reported ? { report: booking.id } : {}) },
      }
    : {
        pathname: "/bookings/[id]",
        params: { id: booking.id, ...(reported ? { report: "1" } : {}) },
      };
}

/** Back where the person came from, as it was; or, opened from a link, to `href`. */
export function leave(href: ReturnType<typeof backTo>) {
  if (router.canGoBack()) router.back();
  else router.dismissTo(href);
}

/** The note's problem, as typed, as the server checks it: only its length. */
export function noteError(t: Translate, note: string): string | undefined {
  return checkDisputeNote(note).ok
    ? undefined
    : t("trip.note.tooLong", { max: disputeNoteMaxLength });
}

/** The note to send: trimmed, and left out when empty. */
export function noteBody(note: string): { note?: string } {
  const tidy = note.trim();
  return tidy === "" ? {} : { note: tidy };
}

/** A booking that changed meanwhile, with the way back to it or its trip. */
export function Changed({ booking }: { readonly booking: Booking }) {
  const { t } = useLanguage();
  return (
    <>
      <Notice message={t("report.changed")} />
      <Button
        variant="secondary"
        label={booking.viewer === "driver" ? t("booking.backToTrip") : t("booking.backToBooking")}
        onPress={() => {
          leave(backTo(booking));
        }}
      />
    </>
  );
}

/** The booking, while it loads or when it could not be loaded. */
export function useReportBooking() {
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => session.call(bookingRoute, { params: { id } }), [session, id]);
  return { id, ...useLoaded(load) };
}

/** The screen while the booking loads, or when it could not be loaded. */
export function NotLoaded({
  id,
  title,
  answer,
  onRetry,
}: {
  readonly id: string;
  readonly title: string;
  readonly answer: CallFailure | undefined;
  readonly onRetry: () => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <Screen>
      <BackButton fallback={{ pathname: "/bookings/[id]", params: { id } }} />
      {answer === undefined ? (
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      ) : (
        <>
          <Title>{title}</Title>
          <Notice
            message={
              answer.status === 404 || answer.status === 400
                ? t("booking.notFound")
                : answer.error.code === "network_error"
                  ? errorText(t, answer)
                  : t("booking.failed")
            }
          />
          <Button variant="secondary" label={t("common.retry")} onPress={onRetry} />
        </>
      )}
    </Screen>
  );
}

/** "Sunday 15 November · Borgarnes to Blönduós", above a report's title. */
export function BookingLine({ booking }: { readonly booking: Booking }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const { board, alight } = booking;
  return (
    <Text style={[typography.small, { color: palette.textMuted }]}>
      {capitalised(formatDay(new Date(board.plannedAt), locale), locale)} ·{" "}
      {t("search.route", {
        from: board.meetingPoint.name[locale],
        to: alight.meetingPoint.name[locale],
      })}
    </Text>
  );
}

/** Why a report was not taken, or null when the booking moved on meanwhile. */
function problemOf(t: Translate, failure: CallFailure): string | null {
  const { code, allowedAt } = failure.error;
  switch (code) {
    case "no_show_too_early":
    case "report_too_early":
      return allowedAt === undefined
        ? errorText(t, failure)
        : t("report.tooEarly", { time: formatClock(new Date(allowedAt)) });
    case "driver_not_checked_in":
      return t("tripDay.noShowNeedsImHere");
    case "trip_completed":
      return t("report.noShowTooLate");
    case "report_too_late":
      return t("report.driverAbsentTooLate");
    case "validation_failed":
      return t("trip.note.tooLong", { max: disputeNoteMaxLength });
    case "already_reported":
    case "not_confirmed":
    case "not_boarding":
    case "not_found":
      return null;
    default:
      return errorText(t, failure);
  }
}

/**
 * Marking a passenger as a no-show (spec 8, screen 3), by the driver, or
 * saying the driver didn't come (screen 4), by the passenger: what it does
 * and who is told, with an optional note only ShareRide reads. Done, it
 * goes back to the trip or the booking, where focus moves to the report.
 */
export function ReportScreen({ kind }: { readonly kind: DisputeKind }) {
  const { t } = useLanguage();
  const { id, value: answer, reload } = useReportBooking();
  const noShow = kind === "no_show";
  const title = (booking?: Booking) =>
    noShow
      ? booking === undefined
        ? t("tripDay.markNoShow")
        : t("tripDay.markNoShowOf", { name: firstNameOf(t, booking.passenger) })
      : t("tripDay.driverAbsent");
  if (answer === undefined || !answer.ok) {
    return <NotLoaded id={id} title={title()} answer={answer} onRetry={reload} />;
  }
  return <ReportForm kind={kind} booking={answer.data} title={title(answer.data)} />;
}

function ReportForm({
  kind,
  booking,
  title,
}: {
  readonly kind: DisputeKind;
  readonly booking: Booking;
  readonly title: string;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const noShow = kind === "no_show";
  // Paid to the driver in person (rule M6): no refund either way.
  const inPerson = booking.payment === "in_person";
  const name = firstNameOf(t, otherPerson(booking));
  const problem = noteError(t, note);
  // A no-show can be answered until 24 hours after the trip completes, the
  // end of the window to say the driver didn't come.
  const answerBy = booking.tripDay === null ? null : new Date(booking.tripDay.driverAbsentClosesAt);

  const send = async () => {
    if (problem !== undefined) {
      setNotice(problem);
      return;
    }
    setNotice(null);
    setBusy(true);
    const input = { params: { id: booking.id }, body: noteBody(note) };
    const answer: CallResult<typeof markNoShowRoute> | CallResult<typeof reportDriverAbsentRoute> =
      noShow
        ? await session.call(markNoShowRoute, input)
        : await session.call(reportDriverAbsentRoute, input);
    setBusy(false);
    if (answer.ok) {
      router.dismissTo(backTo(booking, true));
      return;
    }
    const why = problemOf(t, answer);
    if (why === null) setChanged(true);
    else setNotice(why);
  };

  if (changed) {
    return (
      <Screen>
        <BackButton fallback={backTo(booking)} />
        <View>
          <BookingLine booking={booking} />
          <Title align="start">{title}</Title>
        </View>
        <TakesFocus>
          <Changed booking={booking} />
        </TakesFocus>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          main
          busy={busy}
          label={noShow ? t("tripDay.markNoShow") : t("tripDay.tellShareRide")}
          onPress={() => {
            void send();
          }}
        />
      }
    >
      <BackButton fallback={backTo(booking)} />
      <View>
        <BookingLine booking={booking} />
        <Title align="start">{title}</Title>
      </View>
      <Card>
        <Text style={[typography.bodyStrong, { color: palette.text }]}>
          {noShow
            ? t(inPerson ? "tripDay.noShowConfirmInPerson" : "tripDay.noShowConfirm")
            : t("tripDay.driverAbsentConfirm", { name })}
        </Text>
        <Body align="start">
          {noShow
            ? t("tripDay.noShowTold", {
                name,
                deadline: answerBy === null ? "" : deadlineText(t, locale, answerBy),
              })
            : t("tripDay.driverAbsentTold", { name })}
        </Body>
        {noShow || booking.total.amount === 0 || inPerson ? null : (
          <Body align="start">
            {t("tripDay.driverAbsentRefund", { amount: formatMoney(booking.total, locale) })}
          </Body>
        )}
      </Card>
      <TextField
        label={t("report.note")}
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
