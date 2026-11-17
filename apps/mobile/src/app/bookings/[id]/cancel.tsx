import type { CallFailure } from "@shareride/api-client";
import {
  bookingRoute,
  cancelBookingRoute,
  cancellationPreviewRoute,
  type Booking,
  type CancellationPreview,
} from "@shareride/contracts";
import { checkNote, noteMaxLength, type CancelReason } from "@shareride/domain";
import { cancelReasonText, capitalised, formatDay } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { refundText } from "@/booking/texts";
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
import { useLoaded } from "@/lib/use-loaded";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { firstNameOf } from "@/people/texts";

/**
 * Cancelling a booking (spec 6, 3.4 and 3.5; screen 6), by its passenger
 * or its driver: the reasons, the refund (rule M2) and, for the reason
 * chosen, whether it shows on the canceller's profile (R6.7, R6.8), all
 * from the server's preview. The driver can add a note to the passenger.
 * "Cancel booking" sends the terms shown; if they changed meanwhile, such
 * as the last 15 minutes before boarding starting, the new ones show to
 * confirm again. Done, it goes back where the canceller came from, the
 * booking or the driver's trip, where focus moves to the outcome. `reason`
 * chooses one to begin with, such as "The trip changed".
 */
export default function CancelBookingScreen() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const { id, reason: given } = useLocalSearchParams<{ id: string; reason?: string }>();
  const load = useCallback(
    () =>
      Promise.all([
        session.call(bookingRoute, { params: { id } }),
        session.call(cancellationPreviewRoute, { params: { id } }),
      ]),
    [session, id],
  );
  const { value: answers, reload } = useLoaded(load);
  const [reason, setReason] = useState<string | null>(given ?? null);
  // Why the terms were loaded again: it stays, with focus, above the new ones.
  const [changed, setChanged] = useState<string | null>(null);
  // The driver's note, kept while the terms load again.
  const [note, setNote] = useState("");
  const back = <BackButton fallback={{ pathname: "/bookings/[id]", params: { id } }} />;

  if (answers === undefined) {
    return (
      <Screen>
        {back}
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  const [booking, preview] = answers;
  if (!booking.ok) return <CancelFailed failure={booking} id={id} onRetry={reload} />;
  if (!preview.ok) {
    return <CancelFailed failure={preview} id={id} booking={booking.data} onRetry={reload} />;
  }
  return (
    <CancelForm
      booking={booking.data}
      preview={preview.data}
      reason={reason}
      note={note}
      onNote={setNote}
      changed={changed}
      onChoose={(chosen) => {
        setChanged(null);
        setReason(chosen);
      }}
      onTermsChanged={() => {
        setChanged(t("booking.termsChanged"));
        reload();
      }}
    />
  );
}

/** Where Keep, Back and a cancellation lead: the driver's trip, or the passenger's booking. */
function backTo(booking: Booking, cancelled?: string) {
  const done = cancelled === undefined ? {} : { cancelled };
  return booking.viewer === "driver"
    ? { pathname: "/drive/trips/[id]", params: { id: booking.trip.id, ...done } }
    : { pathname: "/bookings/[id]", params: { id: booking.id, ...done } };
}

/**
 * Back where the canceller came from, as it was; or, opened from a link,
 * to `href`.
 */
function leave(href: ReturnType<typeof backTo>) {
  if (router.canGoBack()) router.back();
  else router.dismissTo(href);
}

/** "Cancel your booking", or for the driver "Cancel booking: Gunna". */
const titleOf = (t: ReturnType<typeof useLanguage>["t"], booking: Booking) =>
  booking.viewer === "driver"
    ? t("booking.cancelTitleDriver", { name: firstNameOf(t, booking.passenger) })
    : t("booking.cancelTitle");

/**
 * The booking or its terms could not be loaded, or it can no longer be
 * cancelled. `booking`, when it loaded, says whose screen it is.
 */
function CancelFailed({
  failure,
  id,
  booking,
  onRetry,
}: {
  readonly failure: CallFailure;
  readonly id: string;
  readonly booking?: Booking;
  readonly onRetry: () => void;
}) {
  const { t } = useLanguage();
  const notCancellable = failure.error.code === "booking_not_cancellable";
  const back =
    booking === undefined ? { pathname: "/bookings/[id]", params: { id } } : backTo(booking);
  const driver = booking?.viewer === "driver";
  return (
    <Screen>
      <BackButton fallback={back} />
      <Title>{booking === undefined ? t("booking.cancelTitle") : titleOf(t, booking)}</Title>
      <Notice
        message={
          notCancellable
            ? t("booking.notCancellable")
            : failure.status === 404 || failure.status === 400
              ? t("booking.notFound")
              : failure.error.code === "network_error"
                ? errorText(t, failure)
                : t("booking.failed")
        }
      />
      {notCancellable ? (
        <Button
          variant="secondary"
          label={driver ? t("booking.backToTrip") : t("booking.backToBooking")}
          onPress={() => {
            leave(back);
          }}
        />
      ) : (
        <Button variant="secondary" label={t("common.retry")} onPress={onRetry} />
      )}
    </Screen>
  );
}

function CancelForm({
  booking,
  preview,
  reason,
  note,
  onNote,
  changed,
  onChoose,
  onTermsChanged,
}: {
  readonly booking: Booking;
  readonly preview: CancellationPreview;
  /** The reason chosen, if any; one not offered counts as none. */
  readonly reason: string | null;
  /** The driver's note to the passenger, as typed (spec 6, 3.4). */
  readonly note: string;
  readonly onNote: (note: string) => void;
  /** Why the terms were loaded again, if they were. */
  readonly changed: string | null;
  readonly onChoose: (reason: CancelReason) => void;
  /** The terms changed since they showed: load them again. */
  readonly onTermsChanged: () => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const driver = booking.viewer === "driver";
  const passengerName = firstNameOf(t, booking.passenger);
  // Checked as typed, as the server checks it: no contact details (R3.10).
  const noteProblem = checkNote(note.trim())[0];
  const noteError =
    noteProblem === undefined
      ? undefined
      : noteProblem.code === "note_too_long"
        ? t("trip.note.tooLong", { max: noteMaxLength })
        : t("booking.cancelNoteNoContact");
  const chosen = preview.reasons.find((option) => option.reason === reason) ?? null;
  // The refund is the same whatever the reason (rule M2), so it shows before one is chosen.
  const first = preview.reasons[0];
  const terms = chosen ?? first;
  const { board, alight } = booking;
  const name = (stop: Booking["board"]) => stop.meetingPoint.name[locale];

  const cancel = async () => {
    if (noteError !== undefined) {
      setNotice(noteError);
      return;
    }
    if (chosen === null) {
      setNotice(t("booking.cancelChooseReason"));
      return;
    }
    setNotice(null);
    setBusy(true);
    const answer = await session.call(cancelBookingRoute, {
      params: { id: booking.id },
      body: {
        reason: chosen.reason,
        terms: { refund: chosen.refund, countsOnReliability: chosen.countsOnReliability },
        ...(driver && note.trim() !== "" ? { note: note.trim() } : {}),
      },
    });
    setBusy(false);
    if (answer.ok) {
      // The driver's trip says which booking; the passenger's booking is the one.
      router.dismissTo(backTo(booking, driver ? booking.id : "1"));
      return;
    }
    if (answer.error.code === "terms_changed") {
      onTermsChanged();
      return;
    }
    setNotice(
      answer.error.code === "booking_not_cancellable"
        ? t("booking.notCancellable")
        : errorText(t, answer),
    );
  };

  return (
    <Screen
      footer={
        <View style={styles.actions}>
          <Button
            main
            busy={busy}
            label={t("booking.cancel")}
            onPress={() => {
              void cancel();
            }}
          />
          <Button
            variant="text"
            disabled={busy}
            label={driver ? t("booking.keepTheirs") : t("booking.keep")}
            onPress={() => {
              leave(backTo(booking));
            }}
          />
        </View>
      }
    >
      <BackButton fallback={backTo(booking)} />
      <View>
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {capitalised(formatDay(new Date(board.plannedAt), locale), locale)} ·{" "}
          {t("search.route", { from: name(board), to: name(alight) })}
        </Text>
        <Title align="start">{titleOf(t, booking)}</Title>
      </View>

      {changed === null ? null : (
        <TakesFocus key={changed}>
          <Notice kind="info" urgent message={changed} />
        </TakesFocus>
      )}

      <View style={styles.reasons}>
        <Text style={[typography.label, { color: palette.text }]}>{t("booking.cancelWhy")}</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t("booking.cancelWhy")}
          style={styles.chips}
        >
          {preview.reasons.map((option) => (
            <Chip
              key={option.reason}
              role="radio"
              label={cancelReasonText(t, option.reason)}
              selected={option.reason === chosen?.reason}
              onToggle={() => {
                setNotice(null);
                onChoose(option.reason);
              }}
            />
          ))}
        </View>
      </View>

      {terms === undefined ? null : (
        <Card>
          <Text style={[typography.bodyStrong, { color: palette.text }]}>
            {refundText(t, locale, booking, terms)}
          </Text>
          {chosen?.countsOnReliability === true ? (
            <Body align="start">{t("booking.countsOnReliability")}</Body>
          ) : null}
          <Body align="start">
            {driver
              ? t("booking.cancelToldPassenger", { name: passengerName, seats: booking.seats })
              : t("booking.cancelTold", {
                  driver: firstNameOf(t, booking.driver),
                  seats: booking.seats,
                })}
          </Body>
        </Card>
      )}

      {driver ? (
        <TextField
          label={t("booking.cancelNote")}
          value={note}
          onChangeText={(text) => {
            setNotice(null);
            onNote(text);
          }}
          multiline
          maxLength={noteMaxLength * 2}
          help={t("booking.cancelNoteHelp", { max: noteMaxLength, name: passengerName })}
          error={noteError}
        />
      ) : null}

      {notice === null ? null : (
        <TakesFocus key={notice}>
          <Notice message={notice} />
        </TakesFocus>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  reasons: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actions: { gap: spacing.xs },
});
