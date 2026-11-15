import type { CallResult } from "@shareride/api-client";
import { tripDetailsRoute, type TripDetails } from "@shareride/contracts";
import { defaultTripSettings } from "@shareride/domain";
import { capitalised, formatClock, formatDay, formatMoney } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import {
  Baby,
  Car,
  Cigarette,
  CigaretteOff,
  Luggage,
  MessageCircle,
  PawPrint,
  Share as ShareIcon,
  ShieldCheck,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText, formatWait } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { IconButton } from "@/components/icon-button";
import { NeedBubble } from "@/components/need-bubble";
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
import { useLoaded } from "@/lib/use-loaded";
import { RouteMap } from "@/maps/route-map";
import { RouteList } from "@/trip-details/route-list";
import { SeatView } from "@/trip-details/seat-view";
import { carText, childSeatNeedKey, needKeys } from "@/trip-details/texts";
import { positionParam, tripWebAddress, type Part } from "@/trip-details/trip-link";
import {
  controlOutline,
  people,
  peopleColours,
  radii,
  sizes,
  spacing,
  typography,
} from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

type Answer = CallResult<typeof tripDetailsRoute>;

/**
 * Trip details (spec 4, 3.6 and 3.7; spec 15's trip board): the passenger's
 * part with the seat view, the route, the driver and car, preferences and
 * what booking will be like. Open to everyone by link; the part and seats
 * live in the address, so a reload or a shared link shows the same part.
 * Booking comes with spec 5.
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
  const { value: loaded, reload } = useLoaded(load);
  // The last trip stays on screen while a changed part or seat count loads.
  const answer: Answer | undefined = loaded?.id === id ? loaded.answer : undefined;
  const current = loaded?.id === id && loaded.query === query;

  if (answer === undefined || (!current && !answer.ok)) {
    return (
      <Screen>
        <NoIndex />
        <BackButton fallback="/search" />
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!answer.ok) {
    return (
      <Screen>
        <NoIndex />
        <BackButton fallback="/search" />
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
        <BackButton fallback="/search" />
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
        <Heading>{t("trip.yourPart")}</Heading>
        <PartStop stop={boardStop} getIn />
        <PartStop stop={alightStop} getIn={false} />
        <View style={[styles.divider, { backgroundColor: palette.border }]} />
        <SeatView
          offered={trip.seatsOffered}
          free={trip.part.freeSeats}
          yours={Math.min(seats, trip.part.freeSeats)}
          driverColour={trip.driver.colour}
        />
        <Text style={[typography.label, { color: palette.text }]}>
          {t("trip.freeOnPart", { free: trip.part.freeSeats, offered: trip.seatsOffered })}
        </Text>
        <View style={[styles.divider, { backgroundColor: palette.border }]} />
        <Stepper
          beside
          label={t("trip.seats")}
          hint={
            trip.part.pricePerSeat.amount === 0
              ? t("results.free")
              : t("trip.pricePerSeat", { price: formatMoney(trip.part.pricePerSeat, locale) })
          }
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

      <Card>
        <DriverAndCar trip={trip} />
      </Card>
      <View style={styles.row}>
        <Tag
          kind={trip.bookingMode === "instant" ? "positive" : "info"}
          label={
            trip.bookingMode === "instant" ? t("trip.instantBooking") : t("trip.approvalBooking")
          }
        />
      </View>
      <View style={styles.row}>
        <Icon icon={ShieldCheck} color={palette.primary} />
        <Text style={[typography.small, styles.grow, { color: palette.text }]}>
          {t("trip.payInApp")}
        </Text>
      </View>
    </Screen>
  );
}

/** A stop of the part: its time, name and "Get in" or "Get out". */
function PartStop({
  stop,
  getIn,
}: {
  readonly stop: TripDetails["stops"][number];
  readonly getIn: boolean;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  return (
    <View style={styles.partStop}>
      <Text style={[typography.figure, styles.partTime, { color: palette.text }]}>
        {formatClock(new Date(stop.plannedAt))}
      </Text>
      <Text style={[typography.bodyStrong, styles.grow, { color: palette.text }]}>
        {stop.meetingPoint.name[locale]}
      </Text>
      <Tag kind="positive" label={getIn ? t("trip.getIn") : t("trip.getOut")} />
    </View>
  );
}

function DriverAndCar({ trip }: { readonly trip: TripDetails }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const { preferences } = trip;
  const colour = peopleColours[trip.driver.colour % peopleColours.length] ?? people.glacier;
  const needs = [
    { icon: MessageCircle, colour: people.glacier, label: t(needKeys.chat[preferences.chat]) },
    { icon: Luggage, colour: people.sun, label: t(needKeys.luggage[preferences.luggage]) },
    { icon: PawPrint, colour: people.lupine, label: t(needKeys.pets[preferences.pets]) },
    {
      icon: preferences.smoking === "no" ? CigaretteOff : Cigarette,
      colour: people.crowberry,
      label: t(needKeys.smoking[preferences.smoking]),
    },
    { icon: Baby, colour: people.mossLight, label: t(childSeatNeedKey(preferences.childSeat)) },
  ];
  return (
    <>
      <View style={styles.person}>
        <View style={[styles.avatar, { backgroundColor: colour }]}>
          <Text style={[typography.heading, { color: people.face }]}>
            {trip.driver.firstName.charAt(0).toLocaleUpperCase(locale)}
          </Text>
        </View>
        <View style={styles.grow}>
          <Text style={[typography.bodyStrong, { color: palette.text }]}>
            {trip.driver.firstName}
          </Text>
          <View style={styles.row}>
            <Tag kind="warning" label={t("results.newDriver")} />
          </View>
        </View>
      </View>
      {trip.car === null ? null : (
        <View style={styles.person}>
          <View style={[styles.avatar, { backgroundColor: palette.background }]}>
            <Icon icon={Car} color={palette.text} />
          </View>
          <View style={styles.grow}>
            <Text style={[typography.bodyStrong, { color: palette.text }]}>
              {carText(t, trip.car)}
            </Text>
            <Text style={[typography.small, { color: palette.textMuted }]}>
              {t("trip.plateLater")}
            </Text>
          </View>
        </View>
      )}
      <View style={styles.needs}>
        {needs.map((need) => (
          <NeedBubble key={need.label} icon={need.icon} colour={need.colour} label={need.label} />
        ))}
      </View>
      {trip.note === "" ? null : (
        <View>
          <Text style={[typography.label, { color: palette.text }]}>{t("trip.note")}</Text>
          <Body>{trip.note}</Body>
        </View>
      )}
    </>
  );
}

/**
 * The bottom bar, or the panel beside the column on wide screens: the
 * price for the seats chosen and what can be done. Booking comes with
 * spec 5; until then the button says so.
 */
function BookingBar({ trip, pending }: { readonly trip: TripDetails; readonly pending: boolean }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const { part } = trip;
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
      {status === null ? (
        <View style={styles.action}>
          <Button main disabled label={t("trip.bookingSoon")} onPress={() => undefined} />
        </View>
      ) : (
        <View style={styles.action}>
          <Text
            accessibilityLiveRegion="polite"
            style={[typography.label, { color: palette.text }]}
          >
            {status}
          </Text>
          {part.state === "full" && trip.stops.length > 2 ? (
            <Text style={[typography.small, { color: palette.textMuted }]}>
              {t("trip.tryAnotherPart")}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const avatarSize = spacing.xxl;

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  divider: { height: controlOutline / 2 },
  partStop: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  partTime: { minWidth: spacing.xxl + spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
  person: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  avatar: {
    width: avatarSize,
    height: avatarSize,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  needs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  bar: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
  price: { flexShrink: 0 },
  action: { flexGrow: 1, flexBasis: sizes.barAction, alignItems: "flex-end", gap: spacing.xs },
});
