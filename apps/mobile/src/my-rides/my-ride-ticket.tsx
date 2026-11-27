import type { Booking, MyTrip } from "@shareride/contracts";
import {
  cancelReasonText,
  capitalised,
  formatClock,
  formatDay,
  formatDuration,
  formatMoney,
  formatShortDay,
  type Locale,
  type Translate,
} from "@shareride/i18n";
import { router } from "expo-router";
import { Bell, CarFront, Check, Star, Ticket, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { statusKey, statusTag } from "@/booking/status";
import { Avatar } from "@/components/avatar";
import { RideTicket, TicketFoot, type TicketPrice, type TicketTag } from "@/components/ride-ticket";
import { Tag } from "@/components/tag";
import { useLanguage } from "@/i18n/language";
import { dayOf, isoDay } from "@/lib/days";
import type { AppPath } from "@/navigation/link-props";
import { firstNameOf } from "@/people/texts";
import { typography, type Palette } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { endsOf, needTagText, rateTagText } from "./need-texts";
import { needOf, ratingOf, seatsTaken, type Ride } from "./rides";

/** Where a ride lives: the booking (spec 5) or the driver's ride (spec 3). */
export function rideHref(ride: Ride): AppPath {
  return ride.kind === "booking"
    ? { pathname: "/bookings/[id]", params: { id: ride.booking.id } }
    : { pathname: "/drive/trips/[id]", params: { id: ride.trip.id } };
}

/** What differs between a seat of mine and a ride I drive, on their ticket. */
interface Look {
  /** Beside the day: "Passenger" or "You drive". */
  readonly role: TicketTag;
  /** Beside the line: how long it takes, with the stops between for a driver. */
  readonly between: string;
  readonly price: TicketPrice | null;
  /** Under the timetable: why a ride I drove was cancelled. */
  readonly note: string | null;
  /** A ride that is mine has a moss edge: one I drive, or a seat that is confirmed. */
  readonly mine: boolean;
  readonly footStart: ReactNode;
  readonly footEnd: ReactNode;
  /** The price and the foot in words, in the order they show, for the ticket's name. */
  readonly spoken: readonly string[];
}

/**
 * What a ride asks of me, in words with its icon: a bell for what needs
 * me, a star for a rating still to give.
 */
interface Asked {
  readonly label: string;
  readonly icon: LucideIcon;
}

/** What is asked of me, as the yellow tag in a ticket's foot (spec 31, 3.10). */
const askedTag = ({ label, icon }: Asked) => <Tag kind="warning" label={label} icon={icon} />;

/**
 * A seat of mine: my part and what my seats cost, and under the tear line
 * the driver with what the seat needs from me, or else its state. A
 * request says whose answer it waits for; a seat that is mine says so.
 */
function bookingLook(
  t: Translate,
  locale: Locale,
  palette: Palette,
  booking: Booking,
  duration: string,
  asked: Asked | null,
): Look {
  const driver = firstNameOf(t, booking.driver);
  const seats = t("search.seatCount", { count: booking.seats });
  const amount =
    booking.total.amount === 0 ? t("results.free") : formatMoney(booking.total, locale);
  const state =
    booking.status === "requested"
      ? t("myRides.waitingAnswer", { name: driver })
      : booking.status === "confirmed"
        ? t("myRides.seatConfirmed")
        : t(statusKey(booking));
  return {
    role: { label: t("myRides.passenger"), kind: "plain", icon: Ticket },
    between: duration,
    price: { amount, unit: seats },
    note: null,
    mine: booking.status === "confirmed" || booking.status === "completed",
    footStart: (
      <>
        <Avatar
          small
          firstName={driver}
          colour={booking.driver.colour}
          photo={booking.driver.photo}
        />
        <Text style={[typography.label, styles.name, { color: palette.text }]}>{driver}</Text>
      </>
    ),
    footEnd:
      asked === null ? (
        <Tag
          kind={statusTag(booking)}
          label={state}
          icon={booking.status === "confirmed" ? Check : undefined}
        />
      ) : (
        askedTag(asked)
      ),
    spoken: [seats, amount, driver, asked?.label ?? state],
  };
}

/**
 * A ride I drive: the whole way as two ends, with the stops between them
 * counted and no price, and under the tear line the seats taken on its
 * fullest stretch, with what it needs from me at the foot's end, where a
 * seat's ticket has it too. The seats free on each
 * stretch are on the ride's own page (spec 31, 3.5 item 4). A ride I
 * cancelled says so, and why (spec 6, 3.1).
 */
function tripLook(
  t: Translate,
  palette: Palette,
  trip: MyTrip,
  duration: string,
  asked: Asked | null,
): Look {
  const between = trip.stops.length - 2;
  const look = {
    role: { label: t("myRides.driving"), kind: "plain", icon: CarFront },
    between: between > 0 ? t("ride.withStops", { duration, count: between }) : duration,
    price: null,
  } as const;
  if (trip.status === "cancelled") {
    const cancelled = t("booking.status.cancelled");
    const why =
      trip.cancellation === null
        ? null
        : t("driverTrip.cancelledTrip", { reason: cancelReasonText(t, trip.cancellation.reason) });
    return {
      ...look,
      note: why,
      mine: false,
      // Quiet, as a cancelled booking is: nothing is asked of anyone (spec 31, 3.3).
      footStart: <Tag kind="plain" label={cancelled} />,
      footEnd: null,
      spoken: [cancelled, ...(why === null ? [] : [why])],
    };
  }
  // The same words as the driver's own page: requests hold seats too (rule S1).
  const taken = t("driverTrip.taken", { taken: seatsTaken(trip), capacity: trip.seats });
  return {
    ...look,
    note: null,
    mine: true,
    footStart: <Text style={[typography.label, { color: palette.text }]}>{taken}</Text>,
    footEnd: asked === null ? null : askedTag(asked),
    spoken: asked === null ? [taken] : [taken, asked.label],
  };
}

/**
 * A ride of mine as My rides and Find show it (spec 31, 3.3, 3.5 and 3.10;
 * R31.2): a ticket, marked "Passenger" or "You drive", whose foot says in
 * yellow what the ride needs from me, or once it is done whose rating I can
 * still give. Pressing it opens the ride, where that is done: a ticket
 * that opened the rating itself would keep a ride that is done, with its
 * messages and reports, out of reach until the rating is given. With
 * `fill`, in a grid, it is as tall as the tallest of its row.
 */
export function MyRideTicket({
  ride,
  at,
  fill = false,
}: {
  readonly ride: Ride;
  readonly at: Date;
  readonly fill?: boolean;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const needs = needOf(ride, at);
  // A ride that is done needs nothing; a rating is asked in the same place.
  const rating = needs === null ? ratingOf(ride, at) : null;
  const asked: Asked | null =
    needs !== null
      ? { label: needTagText(t, ride, needs, at), icon: Bell }
      : rating === null
        ? null
        : { label: rateTagText(t, rating), icon: Star };
  const duration = formatDuration((ride.endsAt.getTime() - ride.startsAt.getTime()) / 1000, locale);
  const look =
    ride.kind === "booking"
      ? bookingLook(t, locale, palette, ride.booking, duration, asked)
      : tripLook(t, palette, ride.trip, duration, asked);
  const ends = endsOf(ride, locale);
  const clock = { from: formatClock(ride.startsAt), to: formatClock(ride.endsAt) };
  // Screen readers hear the day in full, and the ends as the results say them.
  const label = [
    look.role.label,
    capitalised(formatDay(ride.startsAt, locale), locale),
    t("results.boards", { name: ends.from, time: clock.from }),
    t("results.alights", { name: ends.to, time: clock.to }),
    look.between,
    ...look.spoken,
  ].join(", ");
  return (
    <RideTicket
      testID="my-ride"
      day={capitalised(formatShortDay(isoDay(dayOf(ride.startsAt)), locale), locale)}
      tags={[look.role]}
      from={{ time: clock.from, place: ends.from }}
      to={{ time: clock.to, place: ends.to }}
      between={look.between}
      price={look.price}
      note={look.note}
      mine={look.mine}
      fill={fill}
      accessibilityLabel={label}
      onPress={() => {
        router.push(rideHref(ride));
      }}
      foot={<TicketFoot start={look.footStart} end={look.footEnd} />}
    />
  );
}

const styles = StyleSheet.create({
  // A long name gives way before the tag beside it does.
  name: { flexShrink: 1 },
});
