import { bookingRoute, withdrawRequestRoute, type Booking } from "@shareride/contracts";
import { holdsSeats } from "@shareride/domain";
import { capitalised, formatDay, formatMoney } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { CircleCheck } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import {
  canCancel,
  isWithdrawn,
  offersSearchAgain,
  promptOccasion,
  searchAgainHref,
  statusKey,
  statusTag,
} from "@/booking/status";
import { PaymentSheet, usePayment } from "@/booking/payment";
import { cancellationTexts, payByText, requestSentText } from "@/booking/texts";
import { TripChanges, useMoveChoice } from "@/booking/trip-changes";
import { showsWhereToStand, WhereToStand } from "@/booking/where-to-stand";
import { BackButton } from "@/components/back-button";
import { otherPerson } from "@/chat/texts";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Columns, PageColumn } from "@/components/columns";
import { Grid } from "@/components/grid";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/notice";
import { Screen, useWideScreen } from "@/components/screen";
import { Tag } from "@/components/tag";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Heading, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { bookingShareText } from "@/safety/share-details";
import { TripSafety } from "@/safety/trip-safety";
import { NotificationsPrompt } from "@/notifications/notifications-prompt";
import { onTripDay, PassengerImHere, TripDayHeading } from "@/trip-day/passenger";
import { ReviewSection } from "@/reviews/review-section";
import { ReportStatus } from "@/trip-day/report-status";
import { offersDriverAbsent, reportState } from "@/trip-day/reports";
import { useTripDayRefresh } from "@/trip-day/use-refresh";
import { DriverAndCar, PartStop } from "@/trip-details/trip-parts";
import { controlOutline, maxContentWidth, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { firstNameOf } from "@/people/texts";

/**
 * A booking (spec 5, screens 3, 4, 6 and 8): a request waiting for the
 * driver, which can be withdrawn; an accepted booking to pay for; a confirmed
 * seat with the number plate and where to stand; or one that ended, with
 * "Search again". Until the real provider comes (spec 13), paying opens the
 * test sheet, where no money moves. Once a request is accepted, or a booking
 * paid here, someone we could not reach yet is asked to turn on
 * notifications or add an email (spec 7, 3.6.2). An accepted or confirmed
 * booking ends with "Cancel booking", which opens its own screen (spec 6,
 * 3.5); coming back from it with `cancelled`, focus moves to the outcome.
 * From the wait after the time to get in, the passenger can say the driver
 * didn't come, and a report about the booking shows above its status, to
 * answer if it is about them (spec 8, 3.3 to 3.5); coming back from
 * reporting or answering with `report`, focus moves to it.
 * Changes to the trip since booking show, with the choice to keep or
 * cancel after a big move (spec 6, 3.2). It loads again each time it comes
 * into view. On a wide screen it is a page of two columns (spec 18, 3.9).
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
  const { value: answer, reload, refresh } = useLoadedOnFocus(load);
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
      <Screen width="page">
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
}: {
  readonly booking: Booking;
  /** The status changed on this screen: focus moves to it when it shows. */
  readonly announce: boolean;
  /**
   * A report about it was just made or answered: focus moves to where it
   * stands, or to the status when that says how it ended, once.
   */
  readonly reported: boolean;
  readonly onReportAnnounced: () => void;
  /** Why the booking was loaded again, if it was. */
  readonly stale: string | null;
  /** The passenger starts paying or withdrawing. */
  readonly onAction: () => void;
  /** The booking as a payment or withdrawal left it. */
  readonly onChanged: (booking: Booking) => void;
  /** Something changed on the server meanwhile: say why and load it again. */
  readonly onStale: (why: string) => void;
  /** Load the booking again, quietly, as after "I'm here". */
  readonly onReload: () => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const { board, alight, confirmed } = booking;
  const name = (stop: Booking["board"]) => stop.meetingPoint.name[locale];
  const total = formatMoney(booking.total, locale);
  const free = booking.total.amount === 0;
  const passenger = booking.viewer === "passenger";
  const occasion = promptOccasion(booking);
  const moveChoice = useMoveChoice(booking, now());
  // The trip day (spec 8, 3.1): when and where first, then the car and the
  // driver, then "I'm here" and the chat. It is used while parked.
  const tripDay = onTripDay(booking);
  const wide = useWideScreen();
  const part = (
    <Card>
      <PartStop stop={board} getIn />
      <PartStop stop={alight} getIn={false} />
      <View style={[styles.divider, { backgroundColor: palette.border }]} />
      <View style={styles.spread}>
        <Text style={[typography.label, { color: palette.text }]}>
          {t("search.seatCount", { count: booking.seats })}
        </Text>
        <Text style={[typography.figure, { color: palette.text }]}>
          {free ? t("results.free") : total}
        </Text>
      </View>
    </Card>
  );

  const driver = (
    <Card key="driver" fill={wide}>
      <DriverAndCar
        driver={{
          firstName: firstNameOf(t, booking.driver),
          colour: booking.driver.colour,
          profileId: booking.driver.profileId,
          // Someone leaving, or a former member, has no profile, and shows no standing.
          standing: booking.driver.profileId === null ? null : booking.driver,
        }}
        car={booking.car}
        carNote={
          confirmed !== null
            ? confirmed.registration === null
              ? t("booking.plateLater")
              : t("booking.plate", { plate: confirmed.registration })
            : booking.status === "requested" || booking.status === "accepted"
              ? t("trip.plateLater")
              : undefined
        }
      />
    </Card>
  );
  // Left out, not empty, where there is nothing to show: no gap in a
  // column and no empty cell in a row.
  const stand = showsWhereToStand(booking) ? (
    <WhereToStand key="stand" booking={booking} fill={wide} />
  ) : null;
  const message =
    confirmed === null ? null : (
      <Button
        variant="secondary"
        label={t("chat.messageTo", { name: firstNameOf(t, otherPerson(booking)) })}
        onPress={() => {
          router.push({ pathname: "/messages/[bookingId]", params: { bookingId: booking.id } });
        }}
      />
    );
  // Until the passenger gets out: no trip to be safe on after that.
  const safety =
    holdsSeats(booking.status) && new Date(alight.plannedAt) > now() ? (
      <TripSafety
        regions={[board.meetingPoint.region, alight.meetingPoint.region]}
        share={bookingShareText(t, locale, booking)}
      />
    ) : null;
  // After a move, the choice above cancels, with its reason.
  const cancel =
    passenger && canCancel(booking, now()) && !moveChoice.offered && !moveChoice.pending ? (
      <Button
        variant="text"
        label={t("booking.cancel")}
        onPress={() => {
          onAction();
          router.push({ pathname: "/bookings/[id]/cancel", params: { id: booking.id } });
        }}
      />
    ) : null;
  // A booking that ran or is to run, until 24 hours after the trip completed (R9.1).
  const report = booking.problemReportable ? (
    <Button
      variant="text"
      label={t("report.problem")}
      onPress={() => {
        router.push({
          pathname: "/report",
          params: { kind: "booking", id: booking.id },
        });
      }}
    />
  ) : null;
  // A wide screen (spec 18, 3.9): the ride with its price, then what can be
  // done about the booking, stand beside where it is at and what to do now.
  const side = wide ? (
    <>
      {part}
      {message}
      {safety}
      {cancel}
      {report}
    </>
  ) : null;

  // One tree for a phone and a wide screen: each part of the main column
  // keeps its place among the others, so a payment that is open, a review
  // being written or a question asked stays when the window crosses the
  // breakpoint. What a wide screen shows in the side column is left out
  // of the main column there, and stands in its phone place otherwise.
  return (
    <Screen width="page">
      <BackButton fallback={{ pathname: "/trips/[id]", params: { id: booking.trip.id } }} />
      <View>
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {capitalised(formatDay(new Date(board.plannedAt), locale), locale)}
        </Text>
        <Title align="start">{t("search.route", { from: name(board), to: name(alight) })}</Title>
        <View style={styles.row}>
          <Tag kind={statusTag(booking)} label={t(statusKey(booking))} />
        </View>
      </View>

      <Columns side={side}>
        {stale === null ? null : (
          <TakesFocus key={stale}>
            <Notice message={stale} />
          </TakesFocus>
        )}
        <ReportStatus booking={booking} announce={reported} onAnnounced={onReportAnnounced} />
        {passenger ? (
          <Status
            booking={booking}
            announce={announce || (reported && reportState(booking, now()) === null)}
            onAnnounced={onReportAnnounced}
            onAction={onAction}
            onChanged={onChanged}
            onStale={onStale}
          />
        ) : null}
        {passenger ? (
          <TripChanges
            booking={booking}
            offered={moveChoice.offered}
            keptHere={moveChoice.keptHere}
            onKeep={moveChoice.keep}
            onCancel={onAction}
          />
        ) : null}
        <ReviewSection booking={booking} framed />
        {/* Not on the trip day, when time and place come first. */}
        {occasion === null || tripDay ? null : <NotificationsPrompt occasion={occasion} />}

        {tripDay ? <TripDayHeading booking={booking} /> : wide ? null : part}

        {tripDay && !wide ? stand : null}

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

        {tripDay ? <PassengerImHere booking={booking} onSaid={onReload} onStale={onStale} /> : null}

        {wide ? null : message}

        {offersDriverAbsent(booking, now()) ? (
          <Button
            variant="secondary"
            label={t("tripDay.driverAbsent")}
            onPress={() => {
              router.push({
                pathname: "/bookings/[id]/driver-absent",
                params: { id: booking.id },
              });
            }}
          />
        ) : null}

        {tripDay || wide ? null : stand}

        {wide ? null : safety}

        {tripDay && !wide ? part : null}

        {wide ? null : cancel}

        {wide ? null : report}
      </Columns>
    </Screen>
  );
}

/**
 * Where the booking stands for its passenger: paying when it is due,
 * withdrawing a request, and searching again once it ended.
 */
function Status({
  booking,
  announce,
  onAnnounced,
  onAction,
  onChanged,
  onStale,
}: {
  readonly booking: Booking;
  readonly announce: boolean;
  readonly onAnnounced: () => void;
  readonly onAction: () => void;
  readonly onChanged: (booking: Booking) => void;
  readonly onStale: (why: string) => void;
}) {
  const { locale, t } = useLanguage();
  if (booking.status === "accepted") {
    return <Pay booking={booking} onStart={onAction} onPaid={onChanged} onStale={onStale} />;
  }
  if (booking.status === "requested") {
    return (
      <Requested booking={booking} onStart={onAction} onWithdrawn={onChanged} onStale={onStale} />
    );
  }
  // An action that ends in another status, such as confirmed, moves focus
  // to it; so does a report that ends how the booking stands, such as a
  // no-show agreed to (spec 8, 3.3).
  return (
    <TakesFocus
      key={`${statusKey(booking)}:${booking.dispute?.outcome ?? ""}`}
      when={announce}
      onFocused={onAnnounced}
    >
      <View style={styles.status}>
        <StatusText booking={booking} />
        {offersSearchAgain(booking) ? (
          <Button
            variant="secondary"
            label={t("booking.searchAgain")}
            onPress={() => {
              router.push(searchAgainHref(booking, locale, now()));
            }}
          />
        ) : null}
      </View>
    </TakesFocus>
  );
}

function StatusText({ booking }: { readonly booking: Booking }) {
  const { t } = useLanguage();
  const palette = usePalette();
  switch (booking.status) {
    case "confirmed":
      return (
        <View style={styles.row} accessibilityLiveRegion="polite">
          <Icon icon={CircleCheck} color={palette.primary} />
          <Text style={[typography.heading, styles.grow, { color: palette.text }]}>
            {t("booking.confirmed")}
          </Text>
        </View>
      );
    case "declined":
      // Declined because the driver cancelled the trip, it says so and why (spec 6, 3.3).
      return booking.cancellation === null ? (
        <Notice kind="info" message={t("booking.declined")} />
      ) : (
        <Cancelled booking={booking} />
      );
    case "expired":
      // An expired booking keeps the deadline that passed: the driver's to
      // answer, or the passenger's to pay.
      return (
        <Notice
          kind="info"
          message={
            booking.paymentDueAt === null && booking.requestExpiresAt !== null
              ? t("booking.expired")
              : t("booking.unpaidExpired")
          }
        />
      );
    case "cancelled":
      return isWithdrawn(booking) ? (
        <Notice kind="info" message={t("booking.withdrawn")} />
      ) : (
        <Cancelled booking={booking} />
      );
    case "no_show":
      // While its report is open, the report says where it stands (spec 8, 3.3).
      return booking.dispute !== null && booking.dispute.outcome === null ? null : (
        <Notice kind="info" message={t("booking.noShow")} />
      );
    default:
      return null;
  }
}

/** Who cancelled and why, the refund, and whether it shows on the passenger's profile (spec 6). */
function Cancelled({ booking }: { readonly booking: Booking }) {
  const { locale, t } = useLanguage();
  const texts = cancellationTexts(t, locale, booking);
  if (texts === null) return null;
  return (
    <View style={styles.status}>
      {texts.said === null ? null : <Notice kind="info" message={texts.said} />}
      {texts.note === null ? null : <Body align="start">{texts.note}</Body>}
      {texts.refund === null ? null : <Body align="start">{texts.refund}</Body>}
      {texts.counts ? <Body align="start">{t("booking.countsOnReliability")}</Body> : null}
    </View>
  );
}

/**
 * A request waiting for the driver, with its deadline; it can be withdrawn
 * at any time, after a second press to make sure (spec 5, 3.4; R5.8).
 */
function Requested({
  booking,
  onStart,
  onWithdrawn,
  onStale,
}: {
  readonly booking: Booking;
  readonly onStart: () => void;
  readonly onWithdrawn: (booking: Booking) => void;
  readonly onStale: (why: string) => void;
}) {
  const { t } = useLanguage();
  const session = useSession();
  const [asking, setAsking] = useState(false);
  // Backing out of withdrawing puts focus back on the button.
  const [keptAfterAsking, setKeptAfterAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const driver = firstNameOf(t, booking.driver);

  const withdraw = async () => {
    setNotice(null);
    onStart();
    setBusy(true);
    const answer = await session.call(withdrawRequestRoute, {
      params: { id: booking.id },
      body: {},
    });
    setBusy(false);
    if (answer.ok) {
      onWithdrawn(answer.data);
      return;
    }
    if (answer.error.code === "booking_not_requested" || answer.error.code === "not_found") {
      // The driver answered, or the deadline passed, meanwhile.
      onStale(t("booking.notRequested"));
      return;
    }
    // A lost connection leaves the question open, to try again.
    setNotice(errorText(t, answer));
  };

  return (
    <View style={styles.status}>
      {booking.requestExpiresAt === null ? null : (
        <Notice
          kind="info"
          message={requestSentText(t, driver, new Date(booking.requestExpiresAt), now())}
        />
      )}
      {notice === null ? null : (
        <TakesFocus key={notice}>
          <Notice message={notice} />
        </TakesFocus>
      )}
      {asking ? (
        <TakesFocus>
          <Card>
            <Body align="start">{t("booking.withdrawAsk", { driver, seats: booking.seats })}</Body>
            <Button
              busy={busy}
              label={t("booking.withdraw")}
              onPress={() => {
                void withdraw();
              }}
            />
            <Button
              variant="secondary"
              disabled={busy}
              label={t("booking.withdrawKeep")}
              onPress={() => {
                setNotice(null);
                setAsking(false);
                setKeptAfterAsking(true);
              }}
            />
          </Card>
        </TakesFocus>
      ) : (
        <TakesFocus when={keptAfterAsking}>
          <Button
            variant="secondary"
            label={t("booking.withdraw")}
            onPress={() => {
              setNotice(null);
              setAsking(true);
            }}
          />
        </TakesFocus>
      )}
    </View>
  );
}

/**
 * Pay to confirm, with the deadline (rule M1). With the test provider the
 * app shows its own sheet, where the person picks what the payment does.
 */
function Pay({
  booking,
  onStart,
  onPaid,
  onStale,
}: {
  readonly booking: Booking;
  readonly onStart: () => void;
  readonly onPaid: (booking: Booking) => void;
  readonly onStale: (why: string) => void;
}) {
  const { locale, t } = useLanguage();
  const payment = usePayment({ onSettled: onPaid, onStale });
  const total = formatMoney(booking.total, locale);
  return (
    <View style={styles.pay}>
      <Heading>{t("booking.payNow", { total })}</Heading>
      {booking.paymentDueAt === null ? null : (
        <Body align="start">{payByText(t, new Date(booking.paymentDueAt), now())}</Body>
      )}
      {payment.notice === null ? null : (
        <TakesFocus key={payment.notice}>
          <Notice message={payment.notice} />
        </TakesFocus>
      )}
      {payment.sheet === null ? (
        <Button
          main
          busy={payment.starting}
          label={t("booking.pay", { total })}
          onPress={() => {
            onStart();
            void payment.start(booking.id);
          }}
        />
      ) : (
        <PaymentSheet payment={payment} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
  divider: { height: controlOutline / 2 },
  spread: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  // No wider than a column, also in the main column of a wide page: a
  // notice to read and a button to press, not a banner.
  pay: { gap: spacing.sm, maxWidth: maxContentWidth },
  status: { gap: spacing.sm, maxWidth: maxContentWidth },
});
