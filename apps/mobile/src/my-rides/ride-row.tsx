import type { Booking, MyTrip } from "@shareride/contracts";
import {
  cancelReasonText,
  capitalised,
  formatClock,
  formatDay,
  formatMoney,
  type Locale,
  type Translate,
} from "@shareride/i18n";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { statusKey, statusTag } from "@/booking/status";
import { answerByText, payByText } from "@/booking/texts";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Tag, type TagKind } from "@/components/tag";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { carText } from "@/trip-details/texts";
import { routeText } from "@/trips/texts";
import { needsYou, seatsFree, seatsTaken, type Ride } from "./rides";
import { firstNameOf } from "@/people/texts";

/** Opens a ride where it lives: the booking (spec 5) or the driver's trip page (spec 3). */
export function openRide(ride: Ride): void {
  if (ride.kind === "booking") {
    router.push({ pathname: "/bookings/[id]", params: { id: ride.booking.id } });
  } else {
    router.push({ pathname: "/drive/trips/[id]", params: { id: ride.trip.id } });
  }
}

/**
 * A ride as My rides and Your next ride show it (spec 16, 3.2 and 3.3):
 * the card, and under it Pay or Answer requests when the ride needs me.
 * Both open the same place as the card. With `fill`, in a grid, the card
 * takes the height its row leaves it, so the cards of a row end level and
 * the button stays at the bottom of its cell.
 */
export function RideItem({
  ride,
  at,
  fill = false,
}: {
  readonly ride: Ride;
  readonly at: Date;
  readonly fill?: boolean;
}) {
  const { locale, t } = useLanguage();
  const needs = needsYou(ride, at);
  return (
    <View style={[styles.item, fill && styles.fill]}>
      <RideCard ride={ride} at={at} fill={fill} />
      {needs === null ? null : (
        <Button
          label={
            ride.kind === "booking"
              ? t("booking.pay", { total: formatMoney(ride.booking.total, locale) })
              : t("myRides.answer")
          }
          onPress={() => {
            openRide(ride);
          }}
        />
      )}
    </View>
  );
}

interface Parts {
  /** Next to Passenger or Driving. */
  readonly tag: { readonly label: string; readonly kind: TagKind } | null;
  /** Lines under the times, each with its look. */
  readonly lines: readonly { readonly text: string; readonly look: "strong" | "muted" }[];
  /** A booking's seats and price, on one line. */
  readonly seatsAndPrice: { readonly seats: string; readonly price: string } | null;
}

function bookingParts(t: Translate, locale: Locale, booking: Booking): Parts {
  const car = booking.car === null ? null : carText(t, booking.car);
  return {
    tag: { label: t(statusKey(booking)), kind: statusTag(booking) },
    lines: [
      {
        text:
          car === null
            ? firstNameOf(t, booking.driver)
            : t("myBookings.driverAndCar", { driver: firstNameOf(t, booking.driver), car }),
        look: "muted",
      },
    ],
    seatsAndPrice: {
      seats: t("search.seatCount", { count: booking.seats }),
      price: booking.total.amount === 0 ? t("results.free") : formatMoney(booking.total, locale),
    },
  };
}

/** The seats free on every stretch in one line when they are the same, otherwise one line a stretch. */
function freeLines(t: Translate, locale: Locale, trip: MyTrip): string[] {
  const free = seatsFree(trip);
  const [first] = free;
  if (first !== undefined && free.every((count) => count === first)) {
    return [t("myRides.freeEverywhere", { count: first })];
  }
  return free.map((count, position) =>
    t("myRides.freeOnStretch", {
      from: trip.stops[position]?.meetingPoint.name[locale] ?? "",
      to: trip.stops[position + 1]?.meetingPoint.name[locale] ?? "",
      count,
    }),
  );
}

function tripParts(t: Translate, locale: Locale, trip: MyTrip): Parts {
  // Cancelled, nobody rides along (spec 6, 3.1): it says so, and why.
  if (trip.status === "cancelled") {
    return {
      tag: { label: t("booking.status.cancelled"), kind: "warning" },
      lines:
        trip.cancellation === null
          ? []
          : [
              {
                text: t("driverTrip.cancelledTrip", {
                  reason: cancelReasonText(t, trip.cancellation.reason),
                }),
                look: "muted",
              },
            ],
      seatsAndPrice: null,
    };
  }
  return {
    tag:
      trip.openRequests === 0
        ? null
        : { label: t("trip.mine.requests", { count: trip.openRequests }), kind: "info" },
    lines: [
      {
        // The same words as the driver's trip page: requests hold seats too (rule S1).
        text: t("driverTrip.taken", { taken: seatsTaken(trip), capacity: trip.seats }),
        look: "strong",
      },
      ...freeLines(t, locale, trip).map((text) => ({ text, look: "muted" as const })),
    ],
    seatsAndPrice: null,
  };
}

/** What the ride asks of me, in words, or null. */
function needsText(t: Translate, ride: Ride, at: Date): string | null {
  switch (needsYou(ride, at)) {
    case "pay":
      return ride.kind === "booking" && ride.booking.paymentDueAt !== null
        ? payByText(t, new Date(ride.booking.paymentDueAt), at)
        : null;
    case "answer":
      return ride.kind === "trip" && ride.trip.requestsCloseAt !== null
        ? answerByText(t, new Date(ride.trip.requestsCloseAt), at)
        : null;
    case null:
      return null;
  }
}

/**
 * Passenger or Driving with the status, the day, the route and the times;
 * a booking's driver, car, seats and price, or a trip's seats taken and
 * free; and what it needs from me (3.3 item 3). Pressing it opens the ride.
 */
function RideCard({
  ride,
  at,
  fill,
}: {
  readonly ride: Ride;
  readonly at: Date;
  readonly fill: boolean;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const role = t(ride.kind === "booking" ? "myRides.passenger" : "myRides.driving");
  const day = capitalised(formatDay(ride.startsAt, locale), locale);
  const route =
    ride.kind === "booking"
      ? t("search.route", {
          from: ride.booking.board.meetingPoint.name[locale],
          to: ride.booking.alight.meetingPoint.name[locale],
        })
      : routeText(t, locale, ride.trip);
  const clock = { from: formatClock(ride.startsAt), to: formatClock(ride.endsAt) };
  const parts =
    ride.kind === "booking"
      ? bookingParts(t, locale, ride.booking)
      : tripParts(t, locale, ride.trip);
  const needs = needsText(t, ride, at);
  // Screen readers say the times in words rather than reading the arrow.
  const label = [
    role,
    day,
    route,
    t("myBookings.times", clock),
    parts.tag?.label ?? null,
    ...parts.lines.map((line) => line.text),
    parts.seatsAndPrice?.seats ?? null,
    parts.seatsAndPrice?.price ?? null,
    needs,
  ]
    .filter((part) => part !== null)
    .join(", ");
  return (
    <Card
      accessibilityLabel={label}
      fill={fill}
      onPress={() => {
        openRide(ride);
      }}
    >
      <View style={styles.row}>
        <Text style={[typography.label, { color: palette.textMuted }]}>{role}</Text>
        {parts.tag === null ? null : <Tag kind={parts.tag.kind} label={parts.tag.label} />}
      </View>
      <Text style={[typography.small, { color: palette.textMuted }]}>{day}</Text>
      <Text style={[typography.heading, { color: palette.text }]}>{route}</Text>
      <Text style={[typography.body, { color: palette.text }]}>{t("search.route", clock)}</Text>
      {parts.lines.map((line) => (
        <Text
          key={line.text}
          style={
            line.look === "strong"
              ? [typography.label, { color: palette.text }]
              : [typography.small, { color: palette.textMuted }]
          }
        >
          {line.text}
        </Text>
      ))}
      {parts.seatsAndPrice === null ? null : (
        <View style={styles.spread}>
          <Text style={[typography.label, { color: palette.text }]}>
            {parts.seatsAndPrice.seats}
          </Text>
          <Text style={[typography.figure, { color: palette.text }]}>
            {parts.seatsAndPrice.price}
          </Text>
        </View>
      )}
      {needs === null ? null : (
        <Text style={[typography.bodyStrong, { color: palette.text }]}>{needs}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  item: { gap: spacing.sm },
  fill: { flexGrow: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  spread: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
