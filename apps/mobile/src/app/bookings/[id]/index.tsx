import { bookingRoute, type Booking } from "@shareride/contracts";
import { holdsSeats } from "@shareride/domain";
import { formatMoney } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { Flag, MessageCircle, Share, UserX, X } from "lucide-react-native";
import { useCallback, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { BookingTicket } from "@/booking/booking-ticket";
import { PaymentSheet, usePayment } from "@/booking/payment";
import {
  canCancel,
  offersSearchAgain,
  promptOccasion,
  searchAgainHref,
  statusKey,
} from "@/booking/status";
import { endedLines } from "@/booking/texts";
import { bookingRoad, bookingTitle, reviewOpen } from "@/booking/title";
import { TripChanges, useMoveChoice } from "@/booking/trip-changes";
import { showsWhereToStand, WhereToStand } from "@/booking/where-to-stand";
import { useWithdraw, WithdrawQuestion } from "@/booking/withdraw";
import { otherPerson } from "@/chat/texts";
import { ActionRows } from "@/components/action-rows";
import { Announcer } from "@/components/announcer";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Columns, PageColumn } from "@/components/columns";
import { Grid } from "@/components/grid";
import { Notice } from "@/components/notice";
import { Road } from "@/components/road";
import { Row } from "@/components/row";
import { Screen, useWideScreen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { TakesFocus } from "@/components/takes-focus";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { shareText, type ShareOutcome } from "@/lib/share";
import { useClock } from "@/lib/use-clock";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { NotificationsPrompt } from "@/notifications/notifications-prompt";
import { firstNameOf } from "@/people/texts";
import { ReviewSection } from "@/reviews/review-section";
import { bookingShareText } from "@/safety/share-details";
import { showsWeatherAndRoads, WeatherAndRoadsRow } from "@/safety/weather-roads-row";
import { spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { onTripDay, PassengerImHere, showsImHere } from "@/trip-day/passenger";
import { ReportStatus } from "@/trip-day/report-status";
import { offersDriverAbsent, reportState } from "@/trip-day/reports";
import { useTripDayRefresh } from "@/trip-day/use-refresh";
import { DriverCard } from "@/trip-details/driver-card";

/**
 * A booked seat (spec 31, 3.8 and 3.9; spec 5, screens 3, 4, 6 and 8). Its
 * title says where the booking stands: a request waiting for the driver,
 * a seat to pay for, a seat confirmed, the trip day counting down, a ride
 * to review, or how it ended; one line under it says what happens next,
 * and a road shows how far it has come. Then the ride as a ticket, the
 * driver with Message and the car, where to stand, and rows for the rest,
 * with what cannot be undone red and last: "Cancel booking", which opens
 * its own screen (spec 6, 3.5), or "Withdraw request", which asks first.
 *
 * It has one main button at most (R31.1), in the bar at the bottom: Pay
 * (until the real provider comes, spec 13, it opens the test sheet, where
 * no money moves), "I'm here" on the trip day with "The driver didn't
 * come" once that is offered (spec 8, 3.2 to 3.4), "Rate the driver" once
 * the ride is over, or "Find another ride" after a booking that ended. On
 * a wide screen it is a page of two columns (3.16, item 2): the road, the
 * driver and where to stand in the main one, and in the side one what the
 * bar holds, the ticket and the rows.
 *
 * Reports about the booking and changes to the ride come directly under
 * the title. Once a request is accepted, or a booking paid here, someone
 * we could not reach yet is asked to turn on notifications or add an
 * email (spec 7, 3.6.2). Coming back from cancelling with `cancelled`, or
 * from reporting or answering with `report`, focus moves to the outcome.
 * It loads again each time it comes into view, and when pulled down (spec
 * 16, 3.9).
 */
export default function BookingScreen() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const { id, cancelled, report } = useLocalSearchParams<{
    id: string;
    cancelled?: string;
    report?: string;
  }>();
  const load = useCallback(() => session.call(bookingRoute, { params: { id } }), [session, id]);
  const { value: answer, reload, refresh, pull } = useLoadedOnFocus(load);
  useTripDayRefresh(answer?.ok === true && onTripDay(answer.data), refresh);
  // The booking as the last payment or withdrawal left it, until it loads
  // again: kept with the answer it changed, so a newer answer wins.
  const [changed, setChanged] = useState<{
    readonly after: typeof answer;
    readonly booking: Booking;
  } | null>(null);
  // Whether an action here changed what shows, so focus moves to the outcome.
  const [acted, setActed] = useState(false);
  // Whether the report or answer made before coming back has been
  // announced: only once, not again when the report changes later.
  const [reportAnnounced, setReportAnnounced] = useState(false);
  // Why the booking is loading again, such as the driver answering first. It
  // stays, with focus, while what shows below it changes.
  const [stale, setStale] = useState<string | null>(null);
  const loadAgain = (why: string) => {
    setChanged(null);
    setActed(false);
    setStale(why);
    refresh();
  };

  // A page while it loads and when it fails, as it is once loaded, so Back
  // does not move on a wide screen.
  if (answer === undefined) {
    return (
      <Screen width="page">
        <BackButton fallback="/my-rides" />
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!answer.ok) {
    return (
      <Screen width="page" refresh={() => pull((loaded) => loaded.ok)}>
        <BackButton fallback="/my-rides" />
        <PageColumn>
          <Notice
            message={
              answer.status === 404 || answer.status === 400
                ? t("booking.notFound")
                : answer.error.code === "network_error"
                  ? errorText(t, answer)
                  : t("booking.failed")
            }
          />
          <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        </PageColumn>
      </Screen>
    );
  }
  const booking =
    changed?.after === answer && changed.booking.id === answer.data.id
      ? changed.booking
      : answer.data;
  return (
    <BookingDetails
      // What was said, asked or opened here is about this booking.
      key={booking.id}
      booking={booking}
      announce={acted || cancelled === "1"}
      reported={report === "1" && !reportAnnounced}
      onReportAnnounced={() => {
        setReportAnnounced(true);
      }}
      stale={stale}
      onAction={() => {
        setStale(null);
      }}
      onChanged={(outcome) => {
        setChanged({ after: answer, booking: outcome });
        setActed(true);
      }}
      onStale={loadAgain}
      onReload={refresh}
      onPull={() => pull((loaded) => loaded.ok)}
    />
  );
}

function BookingDetails({
  booking,
  announce,
  reported,
  onReportAnnounced,
  stale,
  onAction,
  onChanged,
  onStale,
  onReload,
  onPull,
}: {
  readonly booking: Booking;
  /** The status changed on this screen: focus moves to the title when it does. */
  readonly announce: boolean;
  /**
   * A report about it was just made or answered: focus moves to where it
   * stands, or to the title when that says how it ended, once.
   */
  readonly reported: boolean;
  readonly onReportAnnounced: () => void;
  /** Why the booking was loaded again, if it was. */
  readonly stale: string | null;
  /** The passenger starts paying, withdrawing or cancelling. */
  readonly onAction: () => void;
  /** The booking as a payment or withdrawal left it. */
  readonly onChanged: (booking: Booking) => void;
  /** Something changed on the server meanwhile: say why and load it again. */
  readonly onStale: (why: string) => void;
  /** Load the booking again, quietly, as after "I'm here". */
  readonly onReload: () => void;
  /** Load it again for pulling down (spec 16, 3.9), as `useLoaded` says. */
  readonly onPull: () => Promise<boolean | null>;
}) {
  const { locale, t } = useLanguage();
  const wide = useWideScreen();
  // The title counts: "Leaves in 10 minutes" (3.9).
  const at = useClock();
  const { board, alight, confirmed } = booking;
  const passenger = booking.viewer === "passenger";
  const total = formatMoney(booking.total, locale);
  const occasion = promptOccasion(booking);
  const moveChoice = useMoveChoice(booking, now());
  // The trip day (spec 8, 3.1; spec 31, 3.9): where to stand comes first,
  // then the driver and the car. It is used while parked.
  const tripDay = onTripDay(booking);
  // Paying and the question about withdrawing live here, so each stays
  // open when the window crosses the breakpoint and its place moves
  // between the bar and the side column.
  const payment = usePayment({ onSettled: onChanged, onStale });
  const withdrawing = useWithdraw({ booking, onStart: onAction, onWithdrawn: onChanged, onStale });
  // So are that "I'm here" was said here, and that focus went to what it
  // told: moving it between the bar and the side column says nothing new.
  const [saidHere, setSaidHere] = useState<string | null>(null);
  const [saidHeard, setSaidHeard] = useState(false);
  const [shared, setShared] = useState<ShareOutcome | null>(null);

  const head = bookingTitle(t, locale, booking, at);
  const ended = passenger ? endedLines(t, locale, booking) : [];
  const road = bookingRoad(t, booking);
  // The driver said "I'm here" while this page was open: the title says
  // so, and a screen reader hears it.
  const driverHere =
    tripDay && booking.tripDay !== null && booking.tripDay.driverCheckedInAt !== null;
  const [wasHere, setWasHere] = useState(driverHere);
  const [arrived, setArrived] = useState<{ text: string; count: number } | null>(null);
  if (driverHere !== wasHere) {
    setWasHere(driverHere);
    if (driverHere) setArrived({ text: head.title, count: (arrived?.count ?? 0) + 1 });
  }

  const ticket = <BookingTicket booking={booking} />;
  const driver = (
    <DriverCard
      key="driver"
      fill={wide}
      driver={{ ...booking.driver, firstName: firstNameOf(t, booking.driver) }}
      // Someone leaving, or a former member, has no profile, and shows no standing.
      standing={booking.driver.profileId !== null}
      car={booking.car}
      plate={confirmed?.registration ?? null}
      carNote={
        confirmed !== null
          ? confirmed.registration === null
            ? t("booking.plateLater")
            : undefined
          : booking.status === "requested" || booking.status === "accepted"
            ? t("trip.plateLater")
            : undefined
      }
      action={
        passenger && confirmed !== null ? (
          <Button
            variant="secondary"
            label={t("chat.message")}
            accessibilityLabel={t("chat.messageTo", { name: firstNameOf(t, booking.driver) })}
            href={{ pathname: "/messages/[bookingId]", params: { bookingId: booking.id } }}
          />
        ) : null
      }
    />
  );
  // Left out, not empty, where there is nothing to show: no gap in a
  // column and no empty cell in a row.
  const stand = showsWhereToStand(booking) ? (
    <WhereToStand key="stand" booking={booking} fill={wide} />
  ) : null;

  // Until the passenger gets out: no trip to be safe on after that.
  const onTheWay = holdsSeats(booking.status) && new Date(alight.plannedAt) > now();
  const regions = [board.meetingPoint.region, alight.meetingPoint.region];
  const share = onTheWay ? bookingShareText(t, locale, booking) : null;
  const weather = onTheWay && showsWeatherAndRoads(regions);
  // Off the trip day the bar has other things to say; a ride that is over
  // can still be reported for a day (R8.5).
  const absent = offersDriverAbsent(booking, now());
  // After a move, the choice above cancels, with its reason.
  const cancels =
    passenger && canCancel(booking, now()) && !moveChoice.offered && !moveChoice.pending;
  const withdraws = passenger && booking.status === "requested" && !withdrawing.asking;
  const messages = !passenger && confirmed !== null;
  const rows =
    messages ||
    (absent && !tripDay) ||
    share !== null ||
    weather ||
    booking.problemReportable ||
    cancels ||
    withdraws ? (
      <ActionRows>
        {messages ? (
          <Row
            icon={MessageCircle}
            title={t("chat.messageTo", { name: firstNameOf(t, otherPerson(booking)) })}
            href={{ pathname: "/messages/[bookingId]", params: { bookingId: booking.id } }}
          />
        ) : null}
        {absent && !tripDay ? (
          <Row
            icon={UserX}
            title={t("tripDay.driverAbsent")}
            href={{ pathname: "/bookings/[id]/driver-absent", params: { id: booking.id } }}
          />
        ) : null}
        {share === null ? null : (
          <Row
            icon={Share}
            title={t("share.title")}
            onPress={() => {
              setShared(null);
              void shareText(share).then(setShared);
            }}
          />
        )}
        {weather ? <WeatherAndRoadsRow regions={regions} /> : null}
        {/* A booking that ran or is to run, until 24 hours after the trip completed (R9.1). */}
        {booking.problemReportable ? (
          <Row
            icon={Flag}
            title={t("report.problem")}
            href={{ pathname: "/report", params: { kind: "booking", id: booking.id } }}
          />
        ) : null}
        {cancels ? (
          <Row
            danger
            icon={X}
            title={t("booking.cancel")}
            onPress={() => {
              onAction();
              router.push({ pathname: "/bookings/[id]/cancel", params: { id: booking.id } });
            }}
          />
        ) : null}
        {withdraws ? (
          // Backing out of withdrawing puts focus back on the row.
          <TakesFocus when={withdrawing.kept} onFocused={withdrawing.onKeptFocused}>
            <Row danger icon={X} title={t("booking.withdraw")} onPress={withdrawing.ask} />
          </TakesFocus>
        ) : null}
      </ActionRows>
    ) : null;
  const sharing =
    share !== null && shared === "failed" ? (
      // No share sheet and no clipboard: the text itself, to copy by hand.
      <Notice selectable message={t("share.failed", { details: share })} />
    ) : shared === "copied" ? (
      <Notice kind="info" message={t("share.copied")} />
    ) : null;

  // The one main thing to do now (R31.1): in the bar at the bottom of a
  // phone, at the top of a wide screen's side column.
  const action = ((): ReactNode => {
    if (!passenger) return null;
    if (withdrawing.asking) return <WithdrawQuestion booking={booking} withdrawing={withdrawing} />;
    if (booking.status === "accepted") {
      // The payment sheet opens in place of Pay.
      if (payment.sheet !== null) return <PaymentSheet payment={payment} />;
      return (
        <View style={styles.action}>
          {/* Why a payment did not go through, beside the button to try again. */}
          {payment.notice === null ? null : (
            <TakesFocus key={payment.notice}>
              <Notice message={payment.notice} />
            </TakesFocus>
          )}
          <Button
            main
            busy={payment.starting}
            label={t("booking.pay", { total })}
            onPress={() => {
              onAction();
              void payment.start(booking.id);
            }}
          />
        </View>
      );
    }
    if (tripDay) {
      const checkIn = booking.tripDay;
      const imHere = saidHere !== null || showsImHere(booking, now());
      if (checkIn === null || (!imHere && !absent)) return null;
      // While "I'm here" is the button, it is the main one.
      const pressable =
        saidHere === null &&
        checkIn.passengerCheckedInAt === null &&
        now() >= new Date(checkIn.checkInOpensAt) &&
        now() <= new Date(checkIn.checkInClosesAt);
      return (
        <View style={styles.action}>
          {imHere ? (
            <PassengerImHere
              booking={booking}
              said={saidHere}
              focusSaid={!saidHeard}
              onSaidFocused={() => {
                setSaidHeard(true);
              }}
              onSaid={(checkedInAt) => {
                setSaidHere(checkedInAt);
                onReload();
              }}
              onStale={onStale}
            />
          ) : null}
          {absent ? (
            <Button
              variant={pressable ? "secondary" : "primary"}
              main={!pressable}
              fill
              label={t("tripDay.driverAbsent")}
              href={{ pathname: "/bookings/[id]/driver-absent", params: { id: booking.id } }}
            />
          ) : null}
        </View>
      );
    }
    if (reviewOpen(t, booking, at)) {
      return (
        <Button
          main
          label={t("review.rateDriver")}
          href={{ pathname: "/bookings/[id]/rate", params: { id: booking.id } }}
        />
      );
    }
    if (offersSearchAgain(booking)) {
      return (
        <Button
          main
          label={t("booking.searchAgain")}
          onPress={() => {
            router.push(searchAgainHref(booking, locale, now()));
          }}
        />
      );
    }
    return null;
  })();

  // One tree for a phone and a wide screen: each part of the main column
  // keeps its place among the others, so a prompt that is open or a choice
  // just made stays when the window crosses the breakpoint. What a wide
  // screen shows in the side column is left out of the main column there,
  // and stands in its phone place otherwise.
  return (
    <Screen width="page" refresh={onPull} footer={wide || action === null ? undefined : action}>
      <ScreenHead
        back={{ pathname: "/trips/[id]", params: { id: booking.trip.id } }}
        title={head.title}
        over={head.over ?? undefined}
        line={head.line ?? undefined}
        // An action that ends in another status, such as confirmed, moves
        // focus to the title that says so; so does a report that ends how
        // the booking stands, such as a no-show agreed to (spec 8, 3.3).
        outcome={{
          of: `${statusKey(booking)}:${booking.dispute?.outcome ?? ""}`,
          focus: passenger && (announce || (reported && reportState(booking, now()) === null)),
          onFocused: onReportAnnounced,
        }}
        // What else a cancellation says is part of that outcome (spec 6).
        more={
          ended.length === 0
            ? undefined
            : ended.map((line) => (
                <Body key={line} align="start">
                  {line}
                </Body>
              ))
        }
      />
      <Announcer message={arrived} />

      <Columns
        side={
          wide ? (
            <>
              {action}
              {ticket}
              {rows}
              {sharing}
            </>
          ) : null
        }
      >
        {stale === null ? null : (
          <TakesFocus key={stale}>
            <Notice message={stale} />
          </TakesFocus>
        )}
        <ReportStatus booking={booking} announce={reported} onAnnounced={onReportAnnounced} />
        {passenger ? (
          <TripChanges
            booking={booking}
            offered={moveChoice.offered}
            keptHere={moveChoice.keptHere}
            onKeep={moveChoice.keep}
            onCancel={onAction}
          />
        ) : null}
        <ReviewSection booking={booking} framed offer={!passenger} />
        {/* Not on the trip day, when time and place come first. */}
        {occasion === null || tripDay ? null : <NotificationsPrompt occasion={occasion} />}

        {road === null ? null : (
          <Card>
            <Road steps={road.steps} current={road.current} />
          </Card>
        )}

        {wide ? null : tripDay ? stand : ticket}

        {/* Side by side where the column has room for both; where to stand
            comes first on the trip day, as on a phone. */}
        {wide ? (
          <Grid>
            {tripDay ? stand : null}
            {driver}
            {tripDay ? null : stand}
          </Grid>
        ) : (
          driver
        )}

        {wide || tripDay ? null : stand}

        {/* Paid to the driver in person (rule M6): the price, and how; the
            driver reads who pays them. */}
        {booking.status === "confirmed" &&
        booking.payment === "in_person" &&
        booking.total.amount > 0 ? (
          <Notice
            kind="info"
            urgent={false}
            message={
              passenger
                ? t("booking.payInPerson", { total })
                : t("booking.paysYouInPerson", {
                    name: firstNameOf(t, booking.passenger),
                    total,
                  })
            }
          />
        ) : null}

        {!wide && tripDay ? ticket : null}

        {wide ? null : rows}

        {wide ? null : sharing}
      </Columns>
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: { gap: spacing.sm },
});
