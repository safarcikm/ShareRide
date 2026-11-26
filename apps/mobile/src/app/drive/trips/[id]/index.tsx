import type { CallFailure } from "@shareride/api-client";
import { myTripRoute, tripBookingsRoute, type Booking } from "@shareride/contracts";
import { cancelReasonText, capitalised, formatClock, formatDay } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { Share } from "lucide-react-native";
import { useCallback, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { acceptedText } from "@/booking/texts";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Columns, PageColumn } from "@/components/columns";
import { IconButton } from "@/components/icon-button";
import { Notice } from "@/components/notice";
import { Screen, useWideScreen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Heading, Title } from "@/components/text";
import { isChangeable } from "@/driver-trip/changes";
import { PassengersByPart, Stretches } from "@/driver-trip/parts";
import { PostAgain } from "@/driver-trip/post-again";
import { RequestCard } from "@/driver-trip/request-card";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { tripShareText } from "@/safety/share-details";
import { DriverTripDay, onTripDay } from "@/trip-day/driver";
import { ReportStatus } from "@/trip-day/report-status";
import { reportState } from "@/trip-day/reports";
import { useTripDayRefresh } from "@/trip-day/use-refresh";
import { TripSafety } from "@/safety/trip-safety";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { routeText } from "@/trips/texts";
import { firstNameOf } from "@/people/texts";

/**
 * The driver's trip (spec 5, screens 5 and 9): requests first, each to
 * accept or decline; then passengers by where they get in and out, each
 * booking to cancel (spec 6, 3.4); then the seats held on each stretch,
 * "Edit trip" (3.2) and "Cancel trip" (3.3) until it leaves, and "Post
 * again" and "Post the return" (3.6), also once cancelled. It loads
 * again each time it comes into view, and when pulled down (spec 16,
 * 3.9). `cancelled`, the booking just
 * cancelled, says so with focus; so does `tripCancelled`, once the trip is,
 * and `changed`, which changes once each change is saved, with `told`, how
 * many passengers were told. A cancelled trip says why, and nothing more.
 *
 * On a wide screen (spec 18, 3.14) it is a page: Back, the day and the
 * route across the top with "Edit trip" and "Cancel trip" at its end,
 * whole in any window; under it the requests, the passengers, safety and
 * posting again in the main column, and the seats on each stretch beside
 * them. The main column is one tree for a phone and a wide screen: every
 * part keeps its place among the others, so a question that is open stays
 * when the window crosses the breakpoint. What a wide screen shows
 * elsewhere is left out of the main column there.
 */
export default function DriverTripScreen() {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const wide = useWideScreen();
  const { id, cancelled, tripCancelled, changed, told, report } = useLocalSearchParams<{
    id: string;
    cancelled?: string;
    tripCancelled?: string;
    changed?: string;
    told?: string;
    report?: string;
  }>();
  const load = useCallback(
    () =>
      Promise.all([
        session.call(myTripRoute, { params: { id } }),
        session.call(tripBookingsRoute, { params: { id } }),
      ]),
    [session, id],
  );
  const { value: loaded, reload, refresh, pull } = useLoadedOnFocus(load);
  useTripDayRefresh(loaded?.[0].ok === true && onTripDay(loaded[0].data), refresh);
  // The report made or answered before coming back, once focus has moved
  // to it: not again when it changes later.
  const [reportAnnounced, setReportAnnounced] = useState<string | null>(null);
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
      <Screen width="page">
        <BackButton fallback="/drive/trips" />
        <PageColumn>
          <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
        </PageColumn>
      </Screen>
    );
  }
  const [trip, onTrip] = loaded;
  // Pulling down loads both again (spec 16, 3.9).
  const pullBoth = () => pull(([trip, onTrip]) => trip.ok && onTrip.ok);
  if (!trip.ok || !onTrip.ok) {
    const failure: CallFailure = trip.ok ? (onTrip as CallFailure) : trip;
    return (
      <Screen width="page" refresh={pullBoth}>
        <BackButton fallback="/drive/trips" />
        <PageColumn>
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
        </PageColumn>
      </Screen>
    );
  }

  const departure = trip.data.departsAt === null ? null : new Date(trip.data.departsAt);
  // From the planned departure, the trip day takes over (R6.1; spec 8).
  const open = isChangeable(trip.data, now());
  // Until then the trip can be shared, from beside its name (spec 28, 3.1).
  const share = open ? (
    <IconButton
      quiet
      icon={Share}
      label={t("shareRide.heading")}
      onPress={() => {
        router.push({ pathname: "/drive/trips/[id]/share", params: { id } });
      }}
    />
  ) : null;
  const name = (
    <View style={wide || share !== null ? styles.grow : null}>
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
  );
  /** Back and the trip's name; on a wide screen in one row, with `actions` at its end. */
  const head = (actions: ReactNode = null) =>
    wide ? (
      <View testID="page-head" style={styles.wideHead}>
        <BackButton fallback="/drive/trips" />
        {name}
        {share}
        {actions === null ? null : <View style={styles.headActions}>{actions}</View>}
      </View>
    ) : (
      <>
        <BackButton fallback="/drive/trips" />
        {share === null ? (
          name
        ) : (
          <View style={styles.nameRow}>
            {name}
            {share}
          </View>
        )}
      </>
    );

  if (trip.data.status === "cancelled") {
    const { cancellation } = trip.data;
    return (
      <Screen width="page">
        {head()}
        <PageColumn>
          <TakesFocus when={tripCancelled !== undefined}>
            <Notice
              kind="info"
              message={
                cancellation === null
                  ? t("trip.cancelled")
                  : t("driverTrip.cancelledTrip", {
                      reason: cancelReasonText(t, cancellation.reason),
                    })
              }
            />
          </TakesFocus>
          {cancellation === null || cancellation.note === "" ? null : (
            <Body align="start">{t("driverTrip.yourNote", { note: cancellation.note })}</Body>
          )}
          <PostAgain tripId={id} />
        </PageColumn>
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
  // Safety stays until the last stop's time, the trip day included (spec 9, 3.3).
  const arrived = trip.data.arrivesAt !== null && new Date(trip.data.arrivesAt) <= now();
  const said =
    outcome !== null && outcome.cancelled === cancelled
      ? { text: outcome.text, key: String(outcome.count) }
      : cancelled === undefined
        ? null
        : { text: t("driverTrip.cancelledBooking"), key: cancelled };

  // On a wide screen these stand beside the trip's name; on a phone, after the lists.
  const editAndCancel = open ? (
    <>
      <Button
        variant="secondary"
        label={t("trip.edit")}
        onPress={() => {
          router.push({ pathname: "/drive/trips/[id]/edit", params: { id } });
        }}
      />
      <Button
        variant="secondary"
        label={t("trip.cancel")}
        onPress={() => {
          router.push({ pathname: "/drive/trips/[id]/cancel", params: { id } });
        }}
      />
    </>
  ) : null;
  const stretches = (
    <>
      <Heading>{t("driverTrip.stretches")}</Heading>
      <Card>
        <Stretches
          trip={trip.data}
          segments={onTrip.data.segments}
          capacity={onTrip.data.capacity}
        />
      </Card>
    </>
  );

  return (
    <Screen width="page" refresh={pullBoth}>
      {head(editAndCancel)}
      <Columns side={wide ? stretches : null}>
        {said === null ? null : (
          <TakesFocus key={said.key}>
            <Notice kind="info" message={said.text} />
          </TakesFocus>
        )}
        {changed === undefined ? null : (
          <TakesFocus key={changed}>
            <Notice
              kind="info"
              message={t(told === "0" ? "driverTrip.changedNobody" : "driverTrip.changed")}
            />
          </TakesFocus>
        )}
        <Reports
          riding={riding}
          report={report}
          announce={report === reportAnnounced ? undefined : report}
          onAnnounced={() => {
            setReportAnnounced(report ?? null);
          }}
        />
        {onTripDay(trip.data) ? (
          <DriverTripDay
            trip={trip.data}
            bookings={riding}
            onSaid={refresh}
            onStale={() => {
              setOutcome((last) => ({
                text: t("tripDay.tripChanged"),
                count: (last?.count ?? 0) + 1,
                cancelled,
              }));
              refresh();
            }}
          />
        ) : null}
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
        {bookings.length === 0 ? (
          <Body align={wide ? "start" : "center"}>{t("driverTrip.none")}</Body>
        ) : null}
        {wide ? null : stretches}
        {wide ? null : editAndCancel}
        {arrived ? null : (
          <TripSafety
            regions={trip.data.stops.map((stop) => stop.meetingPoint.region)}
            share={tripShareText(t, locale, trip.data)}
          />
        )}
        <PostAgain tripId={id} />
      </Columns>
    </Screen>
  );
}

/**
 * The passengers' reports (spec 8, 3.3 to 3.5), first, as some ask the
 * driver to answer: each under the passenger's name. `report` names the
 * booking just reported or answered; when it is no longer listed, the
 * driver agreed they didn't come, which cancelled it (3.4), and that shows
 * instead. `announce` names it until focus has moved to it once.
 */
function Reports({
  riding,
  report,
  announce,
  onAnnounced,
}: {
  readonly riding: readonly Booking[];
  readonly report: string | undefined;
  readonly announce: string | undefined;
  readonly onAnnounced: () => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const reported = riding.filter((booking) => reportState(booking, now()) !== null);
  const ended = report !== undefined && !riding.some((booking) => booking.id === report);
  if (reported.length === 0 && !ended) return null;
  return (
    <>
      <Heading>{t("dispute.heading")}</Heading>
      {ended ? (
        <TakesFocus key={report}>
          <Notice kind="info" urgent={false} message={t("dispute.cancelledAsIfByYou")} />
        </TakesFocus>
      ) : null}
      {reported.map((booking) => (
        <View key={booking.id} style={styles.report}>
          <Text style={[typography.label, { color: palette.text }]}>
            {firstNameOf(t, booking.passenger)}
          </Text>
          <ReportStatus
            booking={booking}
            announce={announce === booking.id}
            onAnnounced={onAnnounced}
          />
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  report: { gap: spacing.xs },
  wideHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  // `minWidth`: a long route wraps, and does not push the buttons out.
  grow: { flex: 1, minWidth: 0 },
  headActions: { flexDirection: "row", gap: spacing.sm },
  nameRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
});
