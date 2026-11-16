import { bookingRoute, withdrawRequestRoute, type Booking } from "@shareride/contracts";
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
import { WhereToStand } from "@/booking/where-to-stand";
import { BackButton } from "@/components/back-button";
import { otherPerson } from "@/chat/texts";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Tag } from "@/components/tag";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Heading, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { NotificationsPrompt } from "@/notifications/notifications-prompt";
import { DriverAndCar, PartStop } from "@/trip-details/trip-parts";
import { controlOutline, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

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
 * It loads again each time it comes into view.
 */
export default function BookingScreen() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const { id, cancelled } = useLocalSearchParams<{ id: string; cancelled?: string }>();
  const load = useCallback(() => session.call(bookingRoute, { params: { id } }), [session, id]);
  const { value: answer, reload, refresh } = useLoadedOnFocus(load);
  // The booking as the last payment or withdrawal left it, until it loads
  // again: kept with the answer it changed, so a newer answer wins.
  const [changed, setChanged] = useState<{
    readonly after: typeof answer;
    readonly booking: Booking;
  } | null>(null);
  // Whether an action here changed what shows, so focus moves to the outcome.
  const [acted, setActed] = useState(false);
  // Why the booking is loading again, such as the driver answering first. It
  // stays, with focus, while what shows below it changes.
  const [stale, setStale] = useState<string | null>(null);
  const loadAgain = (why: string) => {
    setChanged(null);
    setActed(false);
    setStale(why);
    refresh();
  };

  if (answer === undefined) {
    return (
      <Screen>
        <BackButton fallback="/my-rides" />
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!answer.ok) {
    return (
      <Screen>
        <BackButton fallback="/my-rides" />
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
      stale={stale}
      onAction={() => {
        setStale(null);
      }}
      onChanged={(outcome) => {
        setChanged({ after: answer, booking: outcome });
        setActed(true);
      }}
      onStale={loadAgain}
    />
  );
}

function BookingDetails({
  booking,
  announce,
  stale,
  onAction,
  onChanged,
  onStale,
}: {
  readonly booking: Booking;
  /** The status changed on this screen: focus moves to it when it shows. */
  readonly announce: boolean;
  /** Why the booking was loaded again, if it was. */
  readonly stale: string | null;
  /** The passenger starts paying or withdrawing. */
  readonly onAction: () => void;
  /** The booking as a payment or withdrawal left it. */
  readonly onChanged: (booking: Booking) => void;
  /** Something changed on the server meanwhile: say why and load it again. */
  readonly onStale: (why: string) => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const { board, alight, confirmed } = booking;
  const name = (stop: Booking["board"]) => stop.meetingPoint.name[locale];
  const total = formatMoney(booking.total, locale);
  const free = booking.total.amount === 0;
  const passenger = booking.viewer === "passenger";
  const occasion = promptOccasion(booking);

  return (
    <Screen>
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

      {stale === null ? null : (
        <TakesFocus key={stale}>
          <Notice message={stale} />
        </TakesFocus>
      )}
      {passenger ? (
        <Status
          booking={booking}
          announce={announce}
          onAction={onAction}
          onChanged={onChanged}
          onStale={onStale}
        />
      ) : null}
      {occasion === null ? null : <NotificationsPrompt occasion={occasion} />}

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

      <Card>
        <DriverAndCar
          driver={booking.driver}
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

      {confirmed === null ? null : (
        <Button
          variant="secondary"
          label={t("chat.messageTo", { name: otherPerson(booking).firstName })}
          onPress={() => {
            router.push({ pathname: "/messages/[bookingId]", params: { bookingId: booking.id } });
          }}
        />
      )}

      <WhereToStand booking={booking} />

      {booking.viewer === "passenger" && canCancel(booking, now()) ? (
        <Button
          variant="text"
          label={t("booking.cancel")}
          onPress={() => {
            onAction();
            router.push({ pathname: "/bookings/[id]/cancel", params: { id: booking.id } });
          }}
        />
      ) : null}
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
  onAction,
  onChanged,
  onStale,
}: {
  readonly booking: Booking;
  readonly announce: boolean;
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
  // An action that ends in another status, such as confirmed, moves focus to it.
  return (
    <TakesFocus key={statusKey(booking)} when={announce}>
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
    default:
      // Completed and no-show come with spec 8.
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
  const driver = booking.driver.firstName;

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
  pay: { gap: spacing.sm },
  status: { gap: spacing.sm },
});
