import type { CallResult } from "@shareride/api-client";
import { tripDetailsRoute, type TripDetails } from "@shareride/contracts";
import { defaultTripSettings } from "@shareride/domain";
import { capitalised, formatDay, formatMoney } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { Share as ShareIcon, ShieldCheck } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText, formatWait } from "@/auth/errors";
import { signUpRoute } from "@/auth/next-route";
import { useMe, useSession } from "@/auth/session";
import { bookingHref, keepPendingBooking } from "@/booking/pending-booking";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { IconButton } from "@/components/icon-button";
import { NoIndex } from "@/components/no-index";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { ShareNotice } from "@/components/share-notice";
import { Stepper } from "@/components/stepper";
import { Tag } from "@/components/tag";
import { Body, Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { showsOtherTime } from "@/lib/days";
import { shareLink, type Shared } from "@/lib/share";
import { TripSafety } from "@/safety/trip-safety";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { RouteMap } from "@/maps/route-map";
import { RouteList } from "@/trip-details/route-list";
import { SeatView } from "@/trip-details/seat-view";
import { StopChoice } from "@/trip-details/stop-choice";
import { DriverAndCar } from "@/trip-details/trip-parts";
import { positionParam, tripWebAddress, type Part } from "@/trip-details/trip-link";
import { controlOutline, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

type Answer = CallResult<typeof tripDetailsRoute>;

/**
 * Trip details (spec 4, 3.6 and 3.7; spec 15's trip board; spec 16, 3.7):
 * the passenger's part first, with how booking works, where they get in
 * and out and the seats; then who they ride with and the seat view; then
 * the route and what cancelling costs. Open to everyone by link; the part
 * and seats live in the address, so a reload or a shared link shows the
 * same part. The bottom bar books the part on screen (spec 5).
 */
export default function TripScreen() {
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
  const load = useCallback(
    () =>
      session
        .call(tripDetailsRoute, { params: { id }, query })
        .then((answer) => ({ id, query, answer })),
    [session, id, query],
  );
  // Loads again on coming back, such as from a booking just made.
  const { value: loaded, reload } = useLoadedOnFocus(load);
  // The last trip stays on screen while a changed part or seat count loads.
  const answer: Answer | undefined = loaded?.id === id ? loaded.answer : undefined;
  const current = loaded?.id === id && loaded.query === query;

  if (answer === undefined || (!current && !answer.ok)) {
    return (
      <Screen>
        <NoIndex />
        <BackButton fallback="/" />
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!answer.ok) {
    return (
      <Screen>
        <NoIndex />
        <BackButton fallback="/" />
        <Failure answer={answer} onRetry={reload} />
      </Screen>
    );
  }
  return (
    <Trip
      trip={answer.data}
      asked={board === undefined || alight === undefined ? undefined : { board, alight }}
      seats={seats}
      pending={!current}
    />
  );
}

/** A 400 names what was wrong: the stops of the part, or something else, such as the id. */
const wrongStops = (answer: Extract<Answer, { ok: false }>) =>
  answer.error.details?.some((detail) => detail.path === "fromStop" || detail.path === "toStop") ??
  false;

function Failure({
  answer,
  onRetry,
}: {
  readonly answer: Extract<Answer, { ok: false }>;
  readonly onRetry: () => void;
}) {
  const { t } = useLanguage();
  if (answer.status === 400 && wrongStops(answer)) {
    // A link with stops the trip does not have, or changed by hand.
    return (
      <>
        <Notice message={t("trip.partInvalid")} />
        <Button
          variant="secondary"
          label={t("trip.seeWholeTrip")}
          onPress={() => {
            router.setParams({ from: undefined, to: undefined, seats: undefined });
          }}
        />
      </>
    );
  }
  // An address that is not a trip's fails the server's check of the id.
  if (answer.status === 404 || answer.status === 400) {
    return <Notice message={t("trip.notFound")} />;
  }
  const { code, retryAfterSeconds = 60 } = answer.error;
  return (
    <>
      <Notice
        message={
          code === "rate_limited"
            ? t("trip.rateLimited", { wait: formatWait(t, retryAfterSeconds) })
            : code === "network_error"
              ? errorText(t, answer)
              : t("trip.failed")
        }
      />
      <Button variant="secondary" label={t("common.retry")} onPress={onRetry} />
    </>
  );
}

function Trip({
  trip,
  asked,
  seats,
  pending,
}: {
  readonly trip: TripDetails;
  /** The part in the address, which can be ahead of the trip's answer. */
  readonly asked: Part | undefined;
  readonly seats: number;
  /** The answer is for an earlier part or seat count; the next one is loading. */
  readonly pending: boolean;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const [shared, setShared] = useState<Shared | null>(null);
  // The part asked for leads while its answer loads, so quick changes build
  // on each other and Share sends the part on screen. Prices and seats wait
  // for the answer.
  const part =
    asked !== undefined && asked.board < asked.alight && asked.alight < trip.stops.length
      ? asked
      : trip.part;
  const boardStop = trip.stops[part.board];
  const alightStop = trip.stops[part.alight];
  const first = trip.stops[0];
  const last = trip.stops.at(-1);
  if (
    boardStop === undefined ||
    alightStop === undefined ||
    first === undefined ||
    last === undefined
  ) {
    return null;
  }
  const name = (stop: TripDetails["stops"][number]) => stop.meetingPoint.name[locale];
  const route = t("search.route", { from: name(boardStop), to: name(alightStop) });
  const whole = part.board === 0 && part.alight === trip.stops.length - 1;
  const changePart = (next: Part) => {
    setShared(null);
    router.setParams({ from: String(next.board), to: String(next.alight) });
  };
  const share = async () => {
    const url = tripWebAddress(trip.id, part);
    const outcome = await shareLink(url, t("trip.shareText", { route }));
    setShared({ outcome, url });
  };
  // You can choose up to the seats free, and at least one; a link can ask
  // for more, and then only fewer is offered.
  const most = Math.max(1, Math.min(trip.part.freeSeats, defaultTripSettings.maxSeats));

  return (
    <Screen footerBeside footer={<BookingBar trip={trip} pending={pending} />}>
      <NoIndex />
      <View style={styles.header}>
        <BackButton fallback="/" />
        <IconButton
          icon={ShareIcon}
          label={t("trip.share")}
          onPress={() => {
            void share();
          }}
        />
      </View>
      <ShareNotice shared={shared} />
      <View>
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {capitalised(formatDay(new Date(boardStop.plannedAt), locale), locale)}
        </Text>
        <Text accessibilityRole="header" style={[typography.title, { color: palette.text }]}>
          {route}
        </Text>
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {whole ? t("trip.wholeTrip") : t("results.partOf", { from: name(first), to: name(last) })}
        </Text>
      </View>
      {showsOtherTime(now()) ? <Notice kind="info" message={t("results.icelandTime")} /> : null}

      <Card>
        <View style={styles.cardHeader}>
          <Heading>{t("trip.yourPart")}</Heading>
          <Tag
            kind={trip.bookingMode === "instant" ? "positive" : "info"}
            label={trip.bookingMode === "instant" ? t("results.instant") : t("results.request")}
          />
        </View>
        <StopChoice
          getIn
          stop={boardStop}
          choices={trip.stops.filter((stop) => stop.position < part.alight)}
          onChoose={(position) => {
            changePart({ board: position, alight: part.alight });
          }}
        />
        <StopChoice
          getIn={false}
          stop={alightStop}
          choices={trip.stops.filter((stop) => stop.position > part.board)}
          onChoose={(position) => {
            changePart({ board: part.board, alight: position });
          }}
        />
        <View style={[styles.divider, { backgroundColor: palette.border }]} />
        <Stepper
          beside
          label={t("trip.seats")}
          hint={t("trip.seatsHint", {
            free: trip.part.freeSeats,
            price:
              trip.part.pricePerSeat.amount === 0
                ? t("results.free")
                : t("trip.pricePerSeat", { price: formatMoney(trip.part.pricePerSeat, locale) }),
          })}
          value={seats}
          min={1}
          max={most}
          onChange={(value) => {
            router.setParams({ seats: String(value) });
          }}
          valueText={t("search.seatCount", { count: seats })}
          fewerLabel={t("search.fewerSeats")}
          moreLabel={t("search.moreSeats")}
        />
      </Card>

      <Card>
        <Heading>{t("trip.whoYouRideWith")}</Heading>
        <DriverAndCar
          driver={{ ...trip.driver, standing: trip.driver }}
          car={trip.car}
          carNote={t("trip.plateLater")}
          preferences={trip.preferences}
          note={trip.note}
        />
        <View style={[styles.divider, { backgroundColor: palette.border }]} />
        <SeatView
          offered={trip.seatsOffered}
          free={trip.part.freeSeats}
          yours={Math.min(seats, trip.part.freeSeats)}
          driverColour={trip.driver.colour}
        />
      </Card>

      <Heading>{t("trip.route")}</Heading>
      <RouteMap
        label={t("trip.routeMap", {
          trip: t("search.route", { from: name(first), to: name(last) }),
          part: route,
        })}
        stops={trip.stops.map((stop) => stop.meetingPoint.position)}
        part={part}
      />
      <RouteList stops={trip.stops} part={part} onChange={changePart} />
      <Body>{t("trip.tapStop")}</Body>
      {trip.part.pricePerSeat.amount === 0 ? null : (
        <View style={styles.row}>
          <Icon icon={ShieldCheck} color={palette.primary} />
          <Text style={[typography.small, styles.grow, { color: palette.text }]}>
            {t("trip.freeCancellation")}
          </Text>
        </View>
      )}
      {trip.part.state === "cancelled" ? null : (
        <TripSafety
          regions={[boardStop.meetingPoint.region, alightStop.meetingPoint.region]}
          share={null}
        />
      )}
    </Screen>
  );
}

/**
 * Whether a trip that has left the boarding stop can still be joined further
 * on: a trip under way takes bookings at each later stop until its own
 * cut-off (rule S4), which the trip page then says when that part is chosen.
 */
function laterStopAhead(trip: TripDetails, board: number): boolean {
  return trip.stops
    .slice(board + 1, -1)
    .some((stop) => new Date(stop.plannedAt).getTime() > now().getTime());
}

/**
 * The bottom bar, or the panel beside the column on wide screens: the
 * price for the seats chosen and what can be done. Booking opens the booking
 * screen for the part on screen; someone without a finished account keeps
 * the choice and signs up first (spec 5, 3.1, item 1). Someone who already
 * holds a booking on the trip is led to it instead.
 */
function BookingBar({ trip, pending }: { readonly trip: TripDetails; readonly pending: boolean }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const me = useMe();
  const { part, myBooking } = trip;
  const free = part.total.amount === 0;
  // The price for the seats and part on screen is on its way.
  const figureColour = pending ? palette.textMuted : palette.text;
  const status = (() => {
    switch (part.state) {
      case "open":
        return null;
      case "full":
        return part.freeSeats === 0
          ? t("trip.fullOnPart")
          : t("trip.tooFewSeats", { count: part.freeSeats });
      case "closed":
        return t("trip.closed");
      case "departed":
        return t("trip.departed");
      case "cancelled":
        return t("trip.cancelled");
      case "own":
        return t("trip.own");
    }
  })();
  const ready = me !== null && me.missingSteps.length === 0;
  const book = () => {
    const choice = {
      tripId: trip.id,
      board: part.board,
      alight: part.alight,
      seats: part.seats,
      fromPoint: trip.stops[part.board]?.meetingPoint.id,
      toPoint: trip.stops[part.alight]?.meetingPoint.id,
    };
    if (ready) {
      router.push(bookingHref(choice));
      return;
    }
    void keepPendingBooking(choice, now()).then(() => {
      router.push(signUpRoute(me));
    });
  };

  const action = (() => {
    if (myBooking !== null) {
      return (
        <View style={styles.action}>
          <Text style={[typography.label, { color: palette.text }]}>{t("booking.yours")}</Text>
          <Button
            main
            label={t("booking.see")}
            onPress={() => {
              router.push({ pathname: "/bookings/[id]", params: { id: myBooking.id } });
            }}
          />
        </View>
      );
    }
    if (status === null) {
      return (
        <View style={styles.action}>
          <Button
            main
            disabled={pending}
            label={trip.bookingMode === "instant" ? t("booking.book") : t("booking.sendRequest")}
            onPress={book}
          />
          {ready ? null : (
            <Text style={[typography.small, { color: palette.textMuted }]}>
              {me === null ? t("booking.signInFirst") : t("booking.finishAccountFirst")}
            </Text>
          )}
        </View>
      );
    }
    return (
      <View style={styles.action}>
        <Text accessibilityLiveRegion="polite" style={[typography.label, { color: palette.text }]}>
          {status}
        </Text>
        {(part.state === "full" && trip.stops.length > 2) ||
        (part.state === "departed" && laterStopAhead(trip, part.board)) ? (
          <Text style={[typography.small, { color: palette.textMuted }]}>
            {t("trip.tryAnotherPart")}
          </Text>
        ) : null}
      </View>
    );
  })();

  return (
    <View style={styles.bar}>
      <View style={styles.price} aria-busy={pending}>
        <Text style={[typography.figure, { color: figureColour }]}>
          {free ? t("results.free") : formatMoney(part.total, locale)}
        </Text>
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {t("search.seatCount", { count: part.seats })}
        </Text>
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  divider: { height: controlOutline / 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
  bar: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
  price: { flexShrink: 0 },
  action: { flexGrow: 1, flexBasis: sizes.barAction, alignItems: "flex-end", gap: spacing.xs },
});
