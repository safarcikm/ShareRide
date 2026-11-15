import type { CallFailure } from "@shareride/api-client";
import {
  bookingRoute,
  startPaymentRoute,
  testPaymentRoute,
  type Booking,
  type Payment,
} from "@shareride/contracts";
import { capitalised, formatDay, formatMoney } from "@shareride/i18n";
import { useLocalSearchParams } from "expo-router";
import { CircleCheck } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { payByText, requestSentText } from "@/booking/texts";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Tag, type TagKind } from "@/components/tag";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Heading, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { useLoaded } from "@/lib/use-loaded";
import { mapsUrl } from "@/meeting-points/maps-url";
import { DriverAndCar, PartStop } from "@/trip-details/trip-parts";
import { controlOutline, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * A booking (spec 5, screens 3, 4 and 8): a request waiting for the driver,
 * an accepted booking to pay for, or a confirmed seat with the number plate
 * and where to stand. Until the real provider comes (spec 13), paying opens
 * the test sheet, where no money moves.
 */
export default function BookingScreen() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => session.call(bookingRoute, { params: { id } }), [session, id]);
  const { value: answer, reload, refresh } = useLoaded(load);
  // The booking as the last payment outcome left it, until it loads again.
  const [paid, setPaid] = useState<Booking | null>(null);
  // Whether paying changed what shows, so focus moves to the outcome.
  const [acted, setActed] = useState(false);
  // The booking stays on screen while it loads again, so a notice about why
  // stays with it.
  const loadAgain = () => {
    setPaid(null);
    setActed(true);
    refresh();
  };

  if (answer === undefined) {
    return (
      <Screen>
        <BackButton fallback="/search" />
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!answer.ok) {
    return (
      <Screen>
        <BackButton fallback="/search" />
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
  const booking = paid?.id === answer.data.id ? paid : answer.data;
  return (
    <BookingDetails
      booking={booking}
      announce={acted}
      onPaid={(outcome) => {
        setPaid(outcome);
        setActed(true);
      }}
      onStale={loadAgain}
    />
  );
}

const statusTags: Record<Booking["status"], TagKind> = {
  requested: "info",
  accepted: "warning",
  confirmed: "positive",
  declined: "warning",
  expired: "warning",
  cancelled: "warning",
  completed: "positive",
  no_show: "warning",
};

function BookingDetails({
  booking,
  announce,
  onPaid,
  onStale,
}: {
  readonly booking: Booking;
  /** The status changed on this screen: focus moves to it when it shows. */
  readonly announce: boolean;
  /** The booking as a payment's outcome left it. */
  readonly onPaid: (booking: Booking) => void;
  /** Something changed on the server: load the booking again. */
  readonly onStale: () => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const [mapsFailed, setMapsFailed] = useState(false);
  const { board, alight, confirmed } = booking;
  const name = (stop: Booking["board"]) => stop.meetingPoint.name[locale];
  const total = formatMoney(booking.total, locale);
  const free = booking.total.amount === 0;
  const passenger = booking.viewer === "passenger";

  return (
    <Screen>
      <BackButton fallback={{ pathname: "/trips/[id]", params: { id: booking.trip.id } }} />
      <View>
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {capitalised(formatDay(new Date(board.plannedAt), locale), locale)}
        </Text>
        <Title align="start">{t("search.route", { from: name(board), to: name(alight) })}</Title>
        <View style={styles.row}>
          <Tag kind={statusTags[booking.status]} label={t(`booking.status.${booking.status}`)} />
        </View>
      </View>

      {passenger ? (
        <Status booking={booking} announce={announce} onPaid={onPaid} onStale={onStale} />
      ) : null}

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
            confirmed === null
              ? t("trip.plateLater")
              : confirmed.registration === null
                ? t("booking.plateLater")
                : t("booking.plate", { plate: confirmed.registration })
          }
        />
      </Card>

      {confirmed === null ? null : (
        <Card>
          <Heading>{t("meetingPoints.whereToStand")}</Heading>
          <Text style={[typography.bodyStrong, { color: palette.text }]}>{name(board)}</Text>
          {confirmed.whereToStand === null ? null : (
            <Body align="start">{confirmed.whereToStand[locale]}</Body>
          )}
          <Button
            variant="secondary"
            label={t("meetingPoints.openInMaps")}
            onPress={() => {
              setMapsFailed(false);
              Linking.openURL(mapsUrl(board.meetingPoint.position, name(board), Platform.OS)).catch(
                () => {
                  setMapsFailed(true);
                },
              );
            }}
          />
          <Notice message={mapsFailed ? t("meetingPoints.mapsFailed") : null} />
        </Card>
      )}
    </Screen>
  );
}

/** Where the booking stands for its passenger, and paying when it is due. */
function Status({
  booking,
  announce,
  onPaid,
  onStale,
}: {
  readonly booking: Booking;
  readonly announce: boolean;
  readonly onPaid: (booking: Booking) => void;
  readonly onStale: () => void;
}) {
  if (booking.status === "accepted") {
    return <Pay booking={booking} onPaid={onPaid} onStale={onStale} />;
  }
  // Paying that ends in another status, such as confirmed, moves focus to it.
  return (
    <TakesFocus key={booking.status} when={announce}>
      <StatusText booking={booking} />
    </TakesFocus>
  );
}

function StatusText({ booking }: { readonly booking: Booking }) {
  const { t } = useLanguage();
  const palette = usePalette();
  switch (booking.status) {
    case "requested":
      return booking.requestExpiresAt === null ? null : (
        <Notice
          kind="info"
          message={requestSentText(
            t,
            booking.driver.firstName,
            new Date(booking.requestExpiresAt),
            now(),
          )}
        />
      );
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
      return <Notice kind="info" message={t("booking.declined")} />;
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
    default:
      // Cancelled, completed and no-show come with spec 6 and spec 8.
      return null;
  }
}

type Paying =
  | { readonly stage: "idle" }
  | { readonly stage: "starting" }
  | { readonly stage: "sheet"; readonly payment: Payment }
  | { readonly stage: "settling"; readonly payment: Payment };

/**
 * Pay to confirm, with the deadline (rule M1). With the test provider the
 * app shows its own sheet, where the person picks what the payment does.
 */
function Pay({
  booking,
  onPaid,
  onStale,
}: {
  readonly booking: Booking;
  readonly onPaid: (booking: Booking) => void;
  readonly onStale: () => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [paying, setPaying] = useState<Paying>({ stage: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const total = formatMoney(booking.total, locale);

  const failed = (failure: CallFailure) => {
    switch (failure.error.code) {
      case "booking_not_payable":
      case "payment_settled":
      case "not_found":
        setNotice(t("booking.paymentClosed"));
        onStale();
        return;
      case "payments_unavailable":
        setNotice(t("booking.paymentsUnavailable"));
        return;
      default:
        setNotice(errorText(t, failure));
    }
  };

  const start = async () => {
    setNotice(null);
    setPaying({ stage: "starting" });
    const answer = await session.call(startPaymentRoute, {
      params: { id: booking.id },
      body: {},
    });
    if (answer.ok) {
      setPaying({ stage: "sheet", payment: answer.data });
      return;
    }
    setPaying({ stage: "idle" });
    failed(answer);
  };

  const settle = async (payment: Payment, outcome: "succeeded" | "failed") => {
    setNotice(null);
    setPaying({ stage: "settling", payment });
    const answer = await session.call(testPaymentRoute, {
      params: { id: payment.paymentId },
      body: { outcome },
    });
    if (!answer.ok) {
      // A failed call leaves the payment as it was: the sheet stays.
      setPaying(
        answer.error.code === "network_error" ? { stage: "sheet", payment } : { stage: "idle" },
      );
      failed(answer);
      return;
    }
    setPaying({ stage: "idle" });
    if (answer.data.status === "accepted") setNotice(t("booking.paymentFailed"));
    onPaid(answer.data);
  };

  const sheet = paying.stage === "sheet" || paying.stage === "settling" ? paying.payment : null;
  return (
    <View style={styles.pay}>
      <Heading>{t("booking.payNow", { total })}</Heading>
      {booking.paymentDueAt === null ? null : (
        <Body align="start">{payByText(t, new Date(booking.paymentDueAt), now())}</Body>
      )}
      {notice === null ? null : (
        <TakesFocus key={notice}>
          <Notice message={notice} />
        </TakesFocus>
      )}
      {sheet === null ? (
        <Button
          main
          busy={paying.stage === "starting"}
          label={t("booking.pay", { total })}
          onPress={() => {
            void start();
          }}
        />
      ) : (
        <Card>
          <TakesFocus>
            <Text accessibilityRole="header" style={[typography.heading, { color: palette.text }]}>
              {t("booking.testPayment.title")}
            </Text>
          </TakesFocus>
          <Body align="start">{t("booking.testPayment.body")}</Body>
          <Button
            main
            busy={paying.stage === "settling"}
            label={t("booking.pay", { total: formatMoney(sheet.amount, locale) })}
            onPress={() => {
              void settle(sheet, "succeeded");
            }}
          />
          <Button
            variant="secondary"
            disabled={paying.stage === "settling"}
            label={t("booking.testPayment.fail")}
            onPress={() => {
              void settle(sheet, "failed");
            }}
          />
        </Card>
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
});
