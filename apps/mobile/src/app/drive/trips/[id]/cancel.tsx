import type { CallFailure } from "@shareride/api-client";
import {
  cancelTripRoute,
  myTripRoute,
  tripBookingsRoute,
  type Booking,
  type MyTrip,
} from "@shareride/contracts";
import {
  checkNote,
  noteMaxLength,
  tripCancellation,
  tripCancelReasons,
  type TripCancelReason,
} from "@shareride/domain";
import { cancelReasonText, capitalised, formatClock, formatDay } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
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
import { useLoaded } from "@/lib/use-loaded";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { routeText } from "@/trips/texts";

/** The bookings that cancelling touches: those holding seats (rule S1). */
type Held = Booking & { readonly status: "requested" | "accepted" | "confirmed" };
const isHeld = (booking: Booking): booking is Held =>
  booking.status === "requested" || booking.status === "accepted" || booking.status === "confirmed";

/**
 * Cancelling a trip (spec 6, 3.3; screen 4), by its driver: a reason, who
 * is affected (everyone who paid gets a full refund, rule M2; requests,
 * unpaid bookings and free rides are told too), whether it shows on the
 * driver's profile (R6.7, worked out by the domain as the server does), and
 * an optional note to everyone on it. "Cancel trip" sends what it showed;
 * if someone paid or left meanwhile, it loads again, keeping the reason and
 * the note, to confirm again. Done, it goes back to the trip, which says so
 * with focus; "Keep the trip" goes back as it was.
 */
export default function CancelTripScreen() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(
    () =>
      Promise.all([
        session.call(myTripRoute, { params: { id } }),
        session.call(tripBookingsRoute, { params: { id } }),
      ]),
    [session, id],
  );
  const { value: loaded, reload } = useLoaded(load);
  const [reason, setReason] = useState<TripCancelReason | null>(null);
  // The note, and why it loaded again, kept while it does.
  const [note, setNote] = useState("");
  const [changed, setChanged] = useState<string | null>(null);
  const back = <BackButton fallback={tripHref(id)} />;

  if (loaded === undefined) {
    return (
      <Screen>
        {back}
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  const [trip, onTrip] = loaded;
  if (!trip.ok || !onTrip.ok) {
    const failure: CallFailure = trip.ok ? (onTrip as CallFailure) : trip;
    return (
      <Screen>
        {back}
        <Title>{t("trip.cancelTitle")}</Title>
        <Notice
          message={
            failure.status === 404
              ? t("trip.notFound")
              : failure.error.code === "network_error"
                ? errorText(t, failure)
                : t("driverTrip.failed")
          }
        />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </Screen>
    );
  }
  const departsAt = trip.data.departsAt === null ? null : new Date(trip.data.departsAt);
  if (
    trip.data.status !== "published" ||
    departsAt === null ||
    departsAt.getTime() <= now().getTime()
  ) {
    return (
      <Screen>
        {back}
        <Title>{t("trip.cancelTitle")}</Title>
        <Notice message={t("trip.notCancellable")} />
        <Button
          variant="secondary"
          label={t("booking.backToTrip")}
          onPress={() => {
            leave(id);
          }}
        />
      </Screen>
    );
  }
  return (
    <CancelTripForm
      trip={trip.data}
      departsAt={departsAt}
      bookings={onTrip.data.bookings.filter(isHeld)}
      reason={reason}
      onReason={(chosen) => {
        setChanged(null);
        setReason(chosen);
      }}
      note={note}
      onNote={setNote}
      changed={changed}
      onTermsChanged={() => {
        setChanged(t("trip.termsChanged"));
        reload();
      }}
    />
  );
}

const tripHref = (id: string, tripCancelled?: string) => ({
  pathname: "/drive/trips/[id]" as const,
  params: { id, ...(tripCancelled === undefined ? {} : { tripCancelled }) },
});

/** Back to the trip as it was; or, opened from a link, to the trip. */
function leave(id: string) {
  if (router.canGoBack()) router.back();
  else router.dismissTo(tripHref(id));
}

function CancelTripForm({
  trip,
  departsAt,
  bookings,
  reason,
  onReason,
  note,
  onNote,
  changed,
  onTermsChanged,
}: {
  readonly trip: MyTrip;
  readonly departsAt: Date;
  readonly bookings: readonly Held[];
  readonly reason: TripCancelReason | null;
  readonly onReason: (reason: TripCancelReason) => void;
  /** The note to everyone on the trip, as typed. */
  readonly note: string;
  readonly onNote: (note: string) => void;
  /** Why it loaded again, if it did. */
  readonly changed: string | null;
  /** Someone paid or left since it showed: load it again. */
  readonly onTermsChanged: () => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Checked as typed, as the server checks it: no contact details (R3.10).
  const noteProblem = checkNote(note.trim())[0];
  const noteError =
    noteProblem === undefined
      ? undefined
      : noteProblem.code === "note_too_long"
        ? t("trip.note.tooLong", { max: noteMaxLength })
        : t("booking.cancelNoteNoContact");
  // A free ride has nothing to refund (R5.11), nor one paid to the driver in
  // person (rule M6): it is told, as requests and unpaid bookings are.
  const paid = bookings.filter(
    (booking) =>
      booking.status === "confirmed" && booking.total.amount > 0 && booking.payment === "in_app",
  ).length;
  const others = bookings.length - paid;
  // Whether it shows on the profile, for the reason chosen, as the server works it out.
  const outcome =
    reason === null
      ? null
      : tripCancellation(
          { status: "published", departsAt },
          bookings.map(({ id, status, total, payment }) => ({
            id,
            status,
            total,
            paymentMethod: payment,
          })),
          reason,
          now(),
        );
  const counts = outcome?.ok === true && outcome.value.countsOnReliability;

  const cancel = async () => {
    if (noteError !== undefined) {
      setNotice(noteError);
      return;
    }
    if (reason === null) {
      setNotice(t("booking.cancelChooseReason"));
      return;
    }
    setNotice(null);
    setBusy(true);
    const answer = await session.call(cancelTripRoute, {
      params: { id: trip.id },
      body: {
        reason,
        countsOnReliability: counts,
        ...(note.trim() === "" ? {} : { note: note.trim() }),
      },
    });
    setBusy(false);
    if (answer.ok) {
      router.dismissTo(tripHref(trip.id, "1"));
      return;
    }
    if (answer.error.code === "terms_changed") {
      onTermsChanged();
      return;
    }
    setNotice(
      answer.error.code === "trip_not_cancellable"
        ? t("trip.notCancellable")
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
            label={t("trip.cancel")}
            onPress={() => {
              void cancel();
            }}
          />
          <Button
            variant="text"
            disabled={busy}
            label={t("trip.keep")}
            onPress={() => {
              leave(trip.id);
            }}
          />
        </View>
      }
    >
      <BackButton fallback={tripHref(trip.id)} />
      <View>
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {capitalised(
            t("trip.mine.when", {
              day: formatDay(departsAt, locale),
              time: formatClock(departsAt),
            }),
            locale,
          )}{" "}
          · {routeText(t, locale, trip)}
        </Text>
        <Title align="start">{t("trip.cancelTitle")}</Title>
      </View>

      {changed === null ? null : (
        <TakesFocus key={changed}>
          <Notice kind="info" urgent message={changed} />
        </TakesFocus>
      )}

      <View style={styles.reasons}>
        <Text style={[typography.label, { color: palette.text }]}>{t("trip.cancelWhy")}</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t("trip.cancelWhy")}
          style={styles.chips}
        >
          {tripCancelReasons.map((option) => (
            <Chip
              key={option}
              role="radio"
              label={cancelReasonText(t, option)}
              selected={option === reason}
              onToggle={() => {
                setNotice(null);
                onReason(option);
              }}
            />
          ))}
        </View>
      </View>

      <Card>
        {bookings.length === 0 ? (
          <Body align="start">{t("trip.cancelNobody")}</Body>
        ) : (
          <>
            {paid === 0 ? null : (
              <Text style={[typography.bodyStrong, { color: palette.text }]}>
                {t("trip.cancelAffects", { count: paid })}
              </Text>
            )}
            {others === 0 ? null : (
              <Body align="start">
                {t(paid === 0 ? "trip.cancelTold" : "trip.cancelAlsoTold", { count: others })}
              </Body>
            )}
          </>
        )}
        {counts ? <Body align="start">{t("trip.cancelCounts")}</Body> : null}
      </Card>

      <TextField
        label={t("trip.cancelNote")}
        value={note}
        onChangeText={(text) => {
          setNotice(null);
          onNote(text);
        }}
        multiline
        maxLength={noteMaxLength * 2}
        help={t("trip.cancelNoteHelp", { max: noteMaxLength })}
        error={noteError}
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
  reasons: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actions: { gap: spacing.xs },
});
