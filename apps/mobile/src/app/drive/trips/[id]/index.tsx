import type { CallFailure } from "@shareride/api-client";
import {
  listVehiclesRoute,
  myTripRoute,
  tripBookingsRoute,
  type Booking,
} from "@shareride/contracts";
import { router, useLocalSearchParams } from "expo-router";
import { MessagesSquare, Pencil, Share, ShieldCheck, X } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { acceptedText } from "@/booking/texts";
import { ActionRows } from "@/components/action-rows";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Columns, PageColumn } from "@/components/columns";
import { IconButton } from "@/components/icon-button";
import { Notice } from "@/components/notice";
import { Row } from "@/components/row";
import { Screen, useWideScreen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Heading } from "@/components/text";
import { isChangeable } from "@/driver-trip/changes";
import { inRideOrder, PassengerRow } from "@/driver-trip/passenger-row";
import { usePostAgain } from "@/driver-trip/post-again";
import { RequestCard } from "@/driver-trip/request-card";
import { DriverRideTicket } from "@/driver-trip/ride-ticket";
import { SeatsCard } from "@/driver-trip/seats-card";
import { driverTitle } from "@/driver-trip/title";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { shareText, type ShareOutcome } from "@/lib/share";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { firstNameOf } from "@/people/texts";
import { tripShareText } from "@/safety/share-details";
import { showsWeatherAndRoads, WeatherAndRoadsRow } from "@/safety/weather-roads-row";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import {
  DriverImHere,
  DriverTripDay,
  driverImHereStops,
  onTripDay,
  type SaidHere,
} from "@/trip-day/driver";
import { ReportStatus } from "@/trip-day/report-status";
import { reportState } from "@/trip-day/reports";
import { useTripDayRefresh } from "@/trip-day/use-refresh";

/** Where Back leads when the ride was opened by its address: My rides lists it. */
const back = "/my-rides";

/**
 * A ride I drive (spec 31, 3.12; spec 5, screens 5 and 9). Its title is
 * "Your ride to Vík", and one line under it says what it needs, or else
 * how it stands. Then the ride as a ticket, with the price of the whole
 * way and the car, and sharing it in its corner (spec 28, 3.1); each
 * request as what needs me, to accept or decline (spec 5, 3.3); the
 * passengers as rows that unfold, each booking to cancel (spec 6, 3.4);
 * the seats in one line, with each stretch behind it; and rows for the
 * rest: "Edit the ride" (3.2), sharing, "Post it again" and "Post the way
 * back" (3.6), and "Cancel the ride" (3.3), red and last (R31.3), until it
 * leaves. Nothing here is the screen's main button but "I'm here" on the
 * trip day (R31.1), in the bar at the bottom (spec 31, 3.9, item 4).
 *
 * It loads again each time it comes into view, and when pulled down (spec
 * 16, 3.9). `cancelled`, the booking just cancelled, says so with focus;
 * so does `tripCancelled`, once the ride is, in its title; and `changed`,
 * which changes once each change is saved, with `told`, how many
 * passengers were told. A ride that was cancelled says why, and keeps its
 * ticket and the two rows that post it again.
 *
 * On a wide screen (3.16, item 3) the title is the page's head; under it
 * what needs me, the passengers and "Drive it again" stand in the main
 * column, and "I'm here", the ticket, the seats and the rows beside them.
 * The main column is one tree for a phone and a wide screen: every part
 * keeps its place among the others, so a question that is open stays when
 * the window crosses the breakpoint. What a wide screen shows in the side
 * column is left out of the main column there.
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
  // For the car on the ticket; the page stands without it. It loads when
  // the page comes into view, not each time the trip day refreshes.
  const loadCars = useCallback(() => session.call(listVehiclesRoute, {}), [session]);
  const { value: cars } = useLoadedOnFocus(loadCars);
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
  // These live here, as their parts move between a phone's column or bar
  // and a wide screen's side column: whether each stretch shows, where
  // "I'm here" was said on this screen and whether focus went to what that
  // told, what sharing the details did, and a draft being made.
  const [stretchesOpen, setStretchesOpen] = useState(false);
  const [saidHere, setSaidHere] = useState<SaidHere | null>(null);
  const [saidHeard, setSaidHeard] = useState(false);
  const [shared, setShared] = useState<ShareOutcome | null>(null);
  const again = usePostAgain(id);

  if (loaded === undefined || cars === undefined) {
    return (
      <Screen width="page">
        <BackButton fallback={back} />
        <PageColumn>
          <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
        </PageColumn>
      </Screen>
    );
  }
  const [trip, onTrip] = loaded;
  // Pulling down loads them again (spec 16, 3.9).
  const pullBoth = () => pull(([trip, onTrip]) => trip.ok && onTrip.ok);
  if (!trip.ok || !onTrip.ok) {
    const failure: CallFailure = trip.ok ? (onTrip as CallFailure) : trip;
    return (
      <Screen width="page" refresh={pullBoth}>
        <BackButton fallback={back} />
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

  const car = cars.ok
    ? (cars.data.vehicles.find((known) => known.id === trip.data.vehicleId) ?? null)
    : null;

  if (trip.data.status === "cancelled") {
    const { cancellation } = trip.data;
    const head = driverTitle(t, locale, trip.data, 0, now());
    return (
      <Screen width="page">
        <ScreenHead
          back={back}
          title={head.title}
          line={head.line}
          // Coming back from cancelling it, focus moves to what says so.
          outcome={{ of: "cancelled", focus: tripCancelled !== undefined }}
          more={
            cancellation === null || cancellation.note === "" ? undefined : (
              <Body align="start">{t("driverTrip.yourNote", { note: cancellation.note })}</Body>
            )
          }
        />
        <PageColumn>
          <DriverRideTicket trip={trip.data} car={car} />
          <View testID="ride-rows">
            <ActionRows>{again.rows}</ActionRows>
          </View>
          {again.notice}
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
  const riding = inRideOrder(bookings.filter((booking) => booking.status !== "requested"));
  const confirmed = riding.filter((booking) => booking.status === "confirmed").length;
  const change = (bookingId: string, booking: Booking | null, said: string) => {
    setAnswered((last) => ({ ...last, [bookingId]: booking }));
    setOutcome((last) => ({ text: said, count: (last?.count ?? 0) + 1, cancelled }));
    refresh();
  };
  const stale = () => {
    setOutcome((last) => ({
      text: t("tripDay.tripChanged"),
      count: (last?.count ?? 0) + 1,
      cancelled,
    }));
    refresh();
  };
  const said =
    outcome !== null && outcome.cancelled === cancelled
      ? { text: outcome.text, key: String(outcome.count) }
      : cancelled === undefined
        ? null
        : { text: t("driverTrip.cancelledBooking"), key: cancelled };

  // From the planned departure, the trip day takes over (R6.1; spec 8).
  const open = isChangeable(trip.data, now());
  const tripDay = onTripDay(trip.data);
  const head = driverTitle(t, locale, trip.data, requests.length, now());
  const toShare = { pathname: "/drive/trips/[id]/share", params: { id } } as const;
  const ticket = (
    <DriverRideTicket
      trip={trip.data}
      car={car}
      // Until it leaves the ride can be shared, from its corner (spec 28, 3.1).
      corner={
        open ? (
          <IconButton
            quiet
            icon={Share}
            label={t("shareRide.heading")}
            onPress={() => {
              router.push(toShare);
            }}
          />
        ) : undefined
      }
    />
  );
  const seats = (
    <SeatsCard
      trip={trip.data}
      segments={onTrip.data.segments}
      capacity={onTrip.data.capacity}
      open={stretchesOpen}
      onToggle={() => {
        setStretchesOpen((was) => !was);
      }}
    />
  );

  // The weather and the roads stay until the last stop's time, the trip day
  // included; the ride's details can be shared until it leaves, as
  // `tripShareText` has none for a ride that has (spec 9, 3.3).
  const arrived = trip.data.arrivesAt !== null && new Date(trip.data.arrivesAt) <= now();
  const regions = trip.data.stops.map((stop) => stop.meetingPoint.region);
  const details = arrived ? null : tripShareText(t, locale, trip.data);
  const weather = !arrived && showsWeatherAndRoads(regions);
  // What changes the ride, shows it to others or keeps it safe; the two
  // that post it again stand with these on a phone, and in the main column
  // on a wide screen.
  const manage =
    open || details !== null || weather ? (
      <>
        {open ? (
          <Row
            icon={Pencil}
            title={t("trip.edit")}
            href={{ pathname: "/drive/trips/[id]/edit", params: { id } }}
          />
        ) : null}
        {/* On a wide screen the ticket, with sharing in its corner, stands
            right over these rows; one row fewer keeps the side column whole
            in a small laptop's window (spec 31, 3.16, item 3). */}
        {open && !wide ? <Row icon={Share} title={t("shareRide.heading")} href={toShare} /> : null}
        {details === null ? null : (
          <Row
            icon={ShieldCheck}
            title={t("share.title")}
            onPress={() => {
              setShared(null);
              void shareText(details).then(setShared);
            }}
          />
        )}
        {weather ? <WeatherAndRoadsRow regions={regions} /> : null}
      </>
    ) : null;
  // What cannot be undone is red and last (R31.3).
  const cancel = open ? (
    <Row
      danger
      icon={X}
      title={t("trip.cancel")}
      href={{ pathname: "/drive/trips/[id]/cancel", params: { id } }}
    />
  ) : null;
  const sharing =
    details !== null && shared === "failed" ? (
      // No share sheet and no clipboard: the text itself, to copy by hand.
      <Notice selectable message={t("share.failed", { details })} />
    ) : shared === "copied" ? (
      <Notice kind="info" message={t("share.copied")} />
    ) : null;

  // The one main thing to do (R31.1), on the trip day: in the bar at the
  // bottom of a phone, at the top of a wide screen's side column.
  const hereAt = driverImHereStops(trip.data, riding, saidHere, now());
  const imHere =
    hereAt.length === 0 ? null : (
      <DriverImHere
        trip={trip.data}
        stops={hereAt}
        said={saidHere}
        focusSaid={!saidHeard}
        onSaidFocused={() => {
          setSaidHeard(true);
        }}
        onSaid={(here) => {
          setSaidHere(here);
          setSaidHeard(false);
          refresh();
        }}
        onStale={stale}
      />
    );

  return (
    <Screen width="page" refresh={pullBoth} footer={wide || imHere === null ? undefined : imHere}>
      <ScreenHead back={back} title={head.title} line={head.line} />
      <Columns
        side={
          wide ? (
            <>
              {imHere}
              {ticket}
              {seats}
              {manage === null && cancel === null ? null : (
                <View testID="ride-rows">
                  <ActionRows>
                    {manage}
                    {cancel}
                  </ActionRows>
                </View>
              )}
              {sharing}
            </>
          ) : null
        }
      >
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
        {/* On the trip day who gets in where comes first; the ticket follows the passengers. */}
        {tripDay ? <DriverTripDay trip={trip.data} bookings={riding} /> : null}
        {wide || tripDay ? null : ticket}
        {requests.length === 0 ? null : (
          <>
            <Heading>{t("myRides.needsYou")}</Heading>
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
            <View style={styles.headed}>
              <View style={styles.grow}>
                <Heading>{t("driverTrip.passengers")}</Heading>
              </View>
              {confirmed === 0 ? null : (
                <Text style={[typography.small, { color: palette.textMuted }]}>
                  {t("driverTrip.confirmedCount", { count: confirmed })}
                </Text>
              )}
            </View>
            <View testID="passengers">
              <ActionRows>
                {riding.map((booking) => (
                  <PassengerRow key={booking.id} booking={booking} />
                ))}
                {/* A confirmed booking has its conversation (spec 7, R7.1). */}
                {riding.some((booking) => booking.confirmed !== null) ? (
                  <Row
                    icon={MessagesSquare}
                    title={t("chat.messageAll")}
                    href={{ pathname: "/drive/trips/[id]/message", params: { id } }}
                  />
                ) : null}
              </ActionRows>
            </View>
          </>
        )}
        {bookings.length === 0 ? <Body align="start">{t("driverTrip.none")}</Body> : null}
        {!wide && tripDay ? ticket : null}
        {wide ? null : seats}
        {wide ? (
          <>
            <Heading>{t("driverTrip.driveAgain")}</Heading>
            <ActionRows>{again.rows}</ActionRows>
          </>
        ) : (
          <View testID="ride-rows">
            <ActionRows>
              {manage}
              {again.rows}
              {cancel}
            </ActionRows>
          </View>
        )}
        {again.notice}
        {wide ? null : sharing}
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
  // A heading with a count at its right.
  headed: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  grow: { flex: 1, minWidth: 0 },
});
