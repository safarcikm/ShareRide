import type { CallFailure } from "@shareride/api-client";
import { bookTripRoute, tripDetailsRoute, type TripDetails } from "@shareride/contracts";
import {
  contactDetailsIn,
  defaultBookingSettings,
  defaultTripSettings,
  type Money,
} from "@shareride/domain";
import { capitalised, formatDay, formatMoney } from "@shareride/i18n";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ShieldCheck } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText, formatWait } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { newAttemptKey } from "@/booking/attempt-key";
import { keepPendingBooking } from "@/booking/pending-booking";
import { bookErrorText } from "@/booking/texts";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Stepper } from "@/components/stepper";
import { Tag } from "@/components/tag";
import { TakesFocus } from "@/components/takes-focus";
import { TextField } from "@/components/text-field";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { useLoaded } from "@/lib/use-loaded";
import { positionParam } from "@/trip-details/trip-link";
import { DriverAndCar, PartStop } from "@/trip-details/trip-parts";
import { controlOutline, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * The booking screen (spec 5, 3.1 and 3.2), opened from trip details with
 * the part and seats in the address. Only for a finished account (R5.1).
 */
export default function BookScreen() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const params = useLocalSearchParams<{ id: string; from?: string; to?: string; seats?: string }>();
  const { id } = params;
  const board = positionParam(params.from);
  const alight = positionParam(params.to);
  const seats = Math.min(
    Math.max(Math.trunc(Number(params.seats)) || 1, 1),
    defaultTripSettings.maxSeats,
  );
  const query = useMemo(
    () => ({
      seats,
      ...(board === undefined ? {} : { fromStop: board }),
      ...(alight === undefined ? {} : { toStop: alight }),
    }),
    [board, alight, seats],
  );
  // Asking again (after "seats taken") keeps the last answer on screen, so
  // what was typed and the attempt's key stay; booking waits for the answer.
  const [round, setRound] = useState(0);
  const load = useCallback(
    () =>
      session
        .call(tripDetailsRoute, { params: { id }, query })
        .then((answer) => ({ query, round, answer })),
    [session, id, query, round],
  );
  const { value: loaded, reload } = useLoaded(load);
  const answer = loaded?.answer;
  const pending = loaded?.query !== query || loaded.round !== round;
  // Without a screen behind (opened after signing up), Back opens the trip
  // with the same part and seats.
  const back = (
    <BackButton
      fallback={{
        pathname: "/trips/[id]",
        params: {
          id,
          ...(params.from === undefined ? {} : { from: params.from }),
          ...(params.to === undefined ? {} : { to: params.to }),
          ...(params.seats === undefined ? {} : { seats: params.seats }),
        },
      }}
    />
  );

  if (answer === undefined) {
    return (
      <Screen>
        {back}
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!answer.ok) {
    return (
      <Screen>
        {back}
        <Notice
          message={
            answer.status === 404 || answer.status === 400
              ? t("trip.notFound")
              : answer.error.code === "rate_limited"
                ? t("trip.rateLimited", {
                    wait: formatWait(t, answer.error.retryAfterSeconds ?? 60),
                  })
                : answer.error.code === "network_error"
                  ? errorText(t, answer)
                  : t("trip.failed")
          }
        />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </Screen>
    );
  }
  const trip = answer.data;
  // Someone who already holds seats on the trip sees that booking instead.
  if (trip.myBooking !== null) {
    return <Redirect href={{ pathname: "/bookings/[id]", params: { id: trip.myBooking.id } }} />;
  }
  return (
    <BookForm
      trip={trip}
      seats={seats}
      pending={pending}
      back={back}
      onReload={() => {
        setRound((count) => count + 1);
      }}
    />
  );
}

/** What the last attempt to book came back with, when it made no booking. */
type Problem =
  | { readonly kind: "seats_taken"; readonly freeSeats: number }
  | { readonly kind: "price_changed"; readonly total: Money }
  | { readonly kind: "message"; readonly text: string }
  | { readonly kind: "other"; readonly text: string };

function BookForm({
  trip,
  seats,
  pending,
  back,
  onReload,
}: {
  readonly trip: TripDetails;
  /** The seats asked for in the address, which the stepper shows at once. */
  readonly seats: number;
  /** The trip's answer is for other seats, or is loading again. */
  readonly pending: boolean;
  readonly back: ReactNode;
  readonly onReload: () => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const { part } = trip;
  const instant = trip.bookingMode === "instant";
  // One key for every try from this screen (R5.4).
  const [attemptKey] = useState(newAttemptKey);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  // Set at once on the first press, before the button shows busy, so a
  // double tap sends one request.
  const sendingNow = useRef(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const boardStop = trip.stops[part.board];
  const alightStop = trip.stops[part.alight];
  if (boardStop === undefined || alightStop === undefined) return null;
  const name = (stop: TripDetails["stops"][number]) => stop.meetingPoint.name[locale];
  // After "price changed", the new total is the one shown, sent and named on
  // the button, so it is never booked without being seen.
  const priceChanged = problem?.kind === "price_changed";
  const total = problem?.kind === "price_changed" ? problem.total : part.total;
  const free = total.amount === 0;
  const most = Math.max(1, Math.min(part.freeSeats, defaultTripSettings.maxSeats));
  const max = defaultBookingSettings.messageMaxLength;
  const trimmed = message.trim();
  const length = Array.from(trimmed.normalize("NFC")).length;
  const messageError =
    length > max
      ? t("booking.messageTooLong", { max })
      : contactDetailsIn(trimmed).length > 0
        ? t("booking.noContactDetails")
        : problem?.kind === "message"
          ? problem.text
          : undefined;
  const status =
    part.state === "open"
      ? null
      : part.state === "full"
        ? part.freeSeats === 0
          ? t("trip.fullOnPart")
          : t("trip.tooFewSeats", { count: part.freeSeats })
        : part.state === "closed"
          ? t("trip.closed")
          : part.state === "own"
            ? t("trip.own")
            : t("booking.notBookable");

  // The server found steps missing, such as new terms to accept (R1.6): keep
  // the choice, and the app leads through the steps and back here.
  const finishAccount = async (failure: CallFailure) => {
    const choice = { tripId: trip.id, board: part.board, alight: part.alight, seats: part.seats };
    await keepPendingBooking(choice, now());
    const me = await session.me();
    if (me.ok && me.data.missingSteps.length > 0) {
      session.update(me.data);
      return;
    }
    setProblem({ kind: "other", text: bookErrorText(t, me.ok ? failure : me) });
  };

  const failed = (failure: CallFailure) => {
    const { code, freeSeats, total: changedTotal } = failure.error;
    if (code === "seats_taken") {
      setProblem({ kind: "seats_taken", freeSeats: freeSeats ?? 0 });
      // The seat count and price come again for what is free now.
      onReload();
    } else if (code === "price_changed" && changedTotal !== undefined) {
      setProblem({ kind: "price_changed", total: changedTotal });
      // The price per seat comes again too.
      onReload();
    } else if (code === "account_incomplete") {
      void finishAccount(failure);
    } else if (failure.status === 400 && failure.error.details?.[0]?.path === "message") {
      const issue = failure.error.details[0].issue;
      setProblem({
        kind: "message",
        text:
          issue === "too_long"
            ? t("booking.messageTooLong", { max })
            : t("booking.noContactDetails"),
      });
    } else {
      setProblem({ kind: "other", text: bookErrorText(t, failure) });
    }
  };

  const book = async () => {
    if (sendingNow.current || pending || messageError !== undefined || status !== null) return;
    sendingNow.current = true;
    setSending(true);
    const answer = await session.call(bookTripRoute, {
      params: { id: trip.id },
      body: {
        fromStop: part.board,
        toStop: part.alight,
        seats: part.seats,
        total,
        message: instant ? "" : trimmed,
        attemptKey,
      },
    });
    if (answer.ok) {
      router.replace({ pathname: "/bookings/[id]", params: { id: answer.data.id } });
      return;
    }
    sendingNow.current = false;
    setSending(false);
    failed(answer);
  };
  const shownTotal = formatMoney(total, locale);
  const label = instant
    ? priceChanged
      ? t("booking.bookAt", { total: shownTotal })
      : t("booking.book")
    : priceChanged
      ? t("booking.sendRequestAt", { total: shownTotal })
      : t("booking.sendRequest");

  return (
    <Screen
      footer={
        status === null ? (
          <Button
            main
            busy={sending || pending}
            disabled={messageError !== undefined}
            label={label}
            onPress={() => {
              void book();
            }}
          />
        ) : (
          <Text
            accessibilityLiveRegion="polite"
            style={[typography.label, { color: palette.text }]}
          >
            {status}
          </Text>
        )
      }
    >
      {back}
      <View>
        <Title align="start">
          {instant ? t("booking.titleInstant") : t("booking.titleRequest")}
        </Title>
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {capitalised(formatDay(new Date(boardStop.plannedAt), locale), locale)}
        </Text>
        <Text style={[typography.bodyStrong, { color: palette.text }]}>
          {t("search.route", { from: name(boardStop), to: name(alightStop) })}
        </Text>
      </View>

      <Card>
        <PartStop stop={boardStop} getIn />
        <PartStop stop={alightStop} getIn={false} />
        <View style={[styles.divider, { backgroundColor: palette.border }]} />
        <Stepper
          beside
          label={t("trip.seats")}
          hint={
            part.pricePerSeat.amount === 0
              ? t("results.free")
              : t("trip.pricePerSeat", { price: formatMoney(part.pricePerSeat, locale) })
          }
          value={seats}
          min={1}
          max={most}
          onChange={(value) => {
            setProblem(null);
            router.setParams({ seats: String(value) });
          }}
          valueText={t("search.seatCount", { count: seats })}
          fewerLabel={t("search.fewerSeats")}
          moreLabel={t("search.moreSeats")}
        />
        <View style={styles.total}>
          <Text style={[typography.label, { color: palette.text }]}>{t("booking.total")}</Text>
          <Text style={[typography.figure, { color: palette.text }]}>
            {free ? t("results.free") : shownTotal}
          </Text>
        </View>
      </Card>

      {problem?.kind === "seats_taken" ? (
        <TakesFocus>
          <View style={styles.problem}>
            <Notice message={t("booking.seatsTaken")} />
            <Body align="start">{t("booking.freeNow", { count: problem.freeSeats })}</Body>
            <Button
              variant="secondary"
              label={t("booking.backToTrip")}
              onPress={() => {
                // Back to the trip page beneath, with the seats free now;
                // without one, it opens in place of this screen.
                router.dismissTo({
                  pathname: "/trips/[id]",
                  params: {
                    id: trip.id,
                    from: String(part.board),
                    to: String(part.alight),
                    seats: String(Math.max(1, problem.freeSeats)),
                  },
                });
              }}
            />
          </View>
        </TakesFocus>
      ) : null}
      {problem?.kind === "price_changed" ? (
        <TakesFocus key={problem.total.amount}>
          <Notice
            kind="info"
            urgent
            message={t(instant ? "booking.priceChanged" : "booking.priceChangedRequest", {
              total: shownTotal,
            })}
          />
        </TakesFocus>
      ) : null}
      {problem?.kind === "other" ? (
        <TakesFocus key={problem.text}>
          <Notice message={problem.text} />
        </TakesFocus>
      ) : null}

      <Card>
        <DriverAndCar
          driver={trip.driver}
          car={trip.car}
          carNote={t("trip.plateLater")}
          preferences={trip.preferences}
          luggageFirst
        />
      </Card>
      <View style={styles.row}>
        <Tag
          kind={instant ? "positive" : "info"}
          label={instant ? t("trip.instantBooking") : t("trip.approvalBooking")}
        />
      </View>

      {instant ? null : (
        <View>
          <TextField
            label={t("booking.message")}
            value={message}
            onChangeText={(text) => {
              setMessage(text);
              if (problem?.kind === "message") setProblem(null);
            }}
            multiline
            maxLength={max * 2}
            help={t("booking.messageHelp", { max })}
            error={messageError}
          />
          <Text style={[typography.small, styles.count, { color: palette.textMuted }]}>
            {t("booking.messageCount", { count: length, max })}
          </Text>
        </View>
      )}

      <View style={styles.row}>
        <Icon icon={ShieldCheck} color={palette.primary} />
        <Text style={[typography.small, styles.grow, { color: palette.text }]}>
          {free ? t("booking.freeRide") : t("booking.payInApp", { total: shownTotal })}
        </Text>
      </View>
      <Body align="start">{t("booking.reliabilityNote")}</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  divider: { height: controlOutline / 2 },
  total: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  problem: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
  count: { textAlign: "right" },
});
