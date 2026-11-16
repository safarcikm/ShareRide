import type { CallFailure } from "@shareride/api-client";
import { myTripRoute, tripBookingsRoute, type Booking } from "@shareride/contracts";
import { capitalised, formatClock, formatDay } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { acceptedText } from "@/booking/texts";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Heading, Title } from "@/components/text";
import { PassengersByPart, Stretches } from "@/driver-trip/parts";
import { RequestCard } from "@/driver-trip/request-card";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { routeText } from "@/trips/texts";

/**
 * The driver's trip (spec 5, screens 5 and 9): requests first, each to
 * accept or decline; then passengers by where they get in and out, each
 * booking to cancel (spec 6, 3.4); then the seats held on each stretch. It
 * loads again each time it comes into view. `cancelled`, the booking just
 * cancelled, says so with focus. Changing or cancelling the trip comes
 * later in spec 6.
 */
export default function DriverTripScreen() {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const { id, cancelled } = useLocalSearchParams<{ id: string; cancelled?: string }>();
  const load = useCallback(
    () =>
      Promise.all([
        session.call(myTripRoute, { params: { id } }),
        session.call(tripBookingsRoute, { params: { id } }),
      ]),
    [session, id],
  );
  const { value: loaded, reload, refresh } = useLoadedOnFocus(load);
  // Each request answered here, as the answer left it (null for one that is
  // gone), until a list loads that shows it answered.
  const [answered, setAnswered] = useState<Readonly<Record<string, Booking | null>>>({});
  // What the last answer did, above the lists, with focus. Each answer
  // counts, so the same words twice still take focus. A booking cancelled
  // after it, which comes back here with `cancelled`, takes its place.
  const [outcome, setOutcome] = useState<{
    text: string;
    count: number;
    cancelled: string | undefined;
  } | null>(null);

  if (loaded === undefined) {
    return (
      <Screen>
        <BackButton fallback="/drive/trips" />
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  const [trip, onTrip] = loaded;
  if (!trip.ok || !onTrip.ok) {
    const failure: CallFailure = trip.ok ? (onTrip as CallFailure) : trip;
    return (
      <Screen>
        <BackButton fallback="/drive/trips" />
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

  // Answers show at once. A request never becomes one again, so a list that
  // still shows it as a request was loaded before the answer.
  const bookings = onTrip.data.bookings
    .map((booking) =>
      booking.status === "requested" && booking.id in answered
        ? (answered[booking.id] ?? null)
        : booking,
    )
    .filter((booking) => booking !== null)
    .filter((booking) => booking.status !== "declined");
  const requests = bookings.filter((booking) => booking.status === "requested");
  const riding = bookings.filter((booking) => booking.status !== "requested");
  const change = (bookingId: string, booking: Booking | null, said: string) => {
    setAnswered((last) => ({ ...last, [bookingId]: booking }));
    setOutcome((last) => ({ text: said, count: (last?.count ?? 0) + 1, cancelled }));
    refresh();
  };
  const departure = trip.data.departsAt === null ? null : new Date(trip.data.departsAt);
  const said =
    outcome !== null && outcome.cancelled === cancelled
      ? { text: outcome.text, key: String(outcome.count) }
      : cancelled === undefined
        ? null
        : { text: t("driverTrip.cancelledBooking"), key: cancelled };

  return (
    <Screen>
      <BackButton fallback="/drive/trips" />
      <View>
        {departure === null ? null : (
          <Text style={[typography.small, { color: palette.textMuted }]}>
            {capitalised(
              t("trip.mine.when", {
                day: formatDay(departure, locale),
                time: formatClock(departure),
              }),
              locale,
            )}
          </Text>
        )}
        <Title align="start">{routeText(t, locale, trip.data)}</Title>
      </View>
      {said === null ? null : (
        <TakesFocus key={said.key}>
          <Notice kind="info" message={said.text} />
        </TakesFocus>
      )}
      {requests.length === 0 ? null : (
        <>
          <Heading>{t("driverTrip.requests")}</Heading>
          {requests.map((booking) => (
            <RequestCard
              key={booking.id}
              booking={booking}
              trip={trip.data}
              segments={onTrip.data.segments}
              capacity={onTrip.data.capacity}
              onAnswered={(answer) => {
                change(
                  booking.id,
                  answer,
                  answer.status === "declined"
                    ? t("request.declined")
                    : acceptedText(t, answer, now()),
                );
              }}
              onGone={() => {
                change(booking.id, null, t("request.gone"));
              }}
            />
          ))}
        </>
      )}
      {riding.length === 0 ? null : (
        <>
          <Heading>{t("driverTrip.passengers")}</Heading>
          <PassengersByPart bookings={riding} />
          {riding.some((booking) => booking.confirmed !== null) ? (
            <Button
              variant="secondary"
              label={t("chat.messageAll")}
              onPress={() => {
                router.push({ pathname: "/drive/trips/[id]/message", params: { id } });
              }}
            />
          ) : null}
        </>
      )}
      {bookings.length === 0 ? <Body>{t("driverTrip.none")}</Body> : null}
      <Heading>{t("driverTrip.stretches")}</Heading>
      <Card>
        <Stretches
          trip={trip.data}
          segments={onTrip.data.segments}
          capacity={onTrip.data.capacity}
        />
      </Card>
    </Screen>
  );
}
