import type { Need } from "@shareride/domain";
import {
  formatClock,
  formatDuration,
  formatMoney,
  formatShortDay,
  type Locale,
  type Translate,
} from "@shareride/i18n";
import { payByShortText } from "@/booking/texts";
import { dayOf, isoDay } from "@/lib/days";
import { firstNameOf } from "@/people/texts";
import type { Ride } from "./rides";

// What a ride needs from me, in words (spec 31, 3.3 item 3): short, for the
// tag in a ticket's foot in My rides (3.10), and as the lines and the
// button of the card on Find (3.5).

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;

/** The two ends of a ride of mine: my part of a booking, the whole way of a ride I drive. */
export function endsOf(ride: Ride, locale: Locale): { readonly from: string; readonly to: string } {
  if (ride.kind === "booking") {
    return {
      from: ride.booking.board.meetingPoint.name[locale],
      to: ride.booking.alight.meetingPoint.name[locale],
    };
  }
  return {
    from: ride.trip.stops[0]?.meetingPoint.name[locale] ?? "",
    to: ride.trip.stops.at(-1)?.meetingPoint.name[locale] ?? "",
  };
}

/**
 * The one who asks, when one person does and the list names them; a
 * former member has no name, and several requests are counted instead.
 */
function asking(ride: Ride) {
  if (ride.kind !== "trip" || ride.trip.openRequests !== 1) return null;
  const first = ride.trip.firstRequest;
  return first === null || first.firstName === null ? null : { ...first, name: first.firstName };
}

/**
 * "Leaves at 18:30"; from an hour before, "Leaves in 40 minutes", never
 * less than one; and "Trip day" once the time to leave has come, as the
 * ride may not have left on the minute.
 */
function leavesText(t: Translate, by: Date, at: Date): string {
  const left = by.getTime() - at.getTime();
  if (left <= 0) return t("tripDay.title");
  if (left > hourMs) return t("needs.leavesAt", { time: formatClock(by) });
  return t("needs.leavesIn", { count: Math.max(1, Math.ceil(left / minuteMs)) });
}

/** "Answer Dóra's request", "2 requests to answer", "Pay by 20:46", "Leaves in 40 minutes". */
export function needTagText(t: Translate, ride: Ride, need: Need, at: Date): string {
  switch (need.kind) {
    case "answer": {
      const one = asking(ride);
      return one === null
        ? t("needs.answerMany", { count: ride.kind === "trip" ? ride.trip.openRequests : 1 })
        : t("needs.answerOne", { name: one.name });
    }
    case "pay":
      return payByShortText(t, need.by, at);
    case "tripDay":
      return leavesText(t, need.by, at);
  }
}

/** Without the full stop an Icelandic date ends with: the text it goes into has its own. */
const unstopped = (text: string) => (text.endsWith(".") ? text.slice(0, -1) : text);

/** How long is left, rounded down to the minute and never below one, as on the request itself. */
function timeLeftText(t: Translate, locale: Locale, by: Date, at: Date): string {
  const minutes = Math.max(1, Math.floor((by.getTime() - at.getTime()) / minuteMs));
  return t("request.timeLeft", { time: formatDuration(minutes * 60, locale) });
}

export interface NeedCardTexts {
  /** One bold line saying what is asked: "Dóra asks for 1 seat". */
  readonly title: string;
  /** "Mjódd to Selfoss, Fri 27 Nov. 11 h left to answer." */
  readonly detail: string;
  /** The button: "See the request", "Pay 1,500 ISK", "See your ride". */
  readonly action: string;
}

/**
 * The card for what needs me: who asks and for what, or that the driver
 * said yes, or when the ride leaves; where and on which day, with the time
 * left; and what the button says. One request from someone named is theirs
 * ("Dóra asks for 1 seat", with the part they ask for); otherwise the
 * requests are counted, with the ride's own ends.
 */
export function needCardTexts(
  t: Translate,
  locale: Locale,
  ride: Ride,
  need: Need,
  at: Date,
): NeedCardTexts {
  const day = unstopped(formatShortDay(isoDay(dayOf(ride.startsAt)), locale));
  /** "Mjódd to Selfoss, Fri 27 Nov.", and what comes after it as a sentence of its own. */
  const where = (ends: { readonly from: string; readonly to: string }, then?: string) => {
    const route = t("ride.fromTo", ends);
    return then === undefined
      ? t("needs.where", { route, day })
      : t("needs.whereThen", { route, day, then: unstopped(then) });
  };
  switch (need.kind) {
    case "answer": {
      const one = asking(ride);
      const left = timeLeftText(t, locale, need.by, at);
      const count = ride.kind === "trip" ? ride.trip.openRequests : 1;
      return one === null
        ? {
            title: t("needs.answerMany", { count }),
            detail: where(endsOf(ride, locale), left),
            action: t("needs.seeRequest", { count }),
          }
        : {
            title: t("needs.asksFor", {
              name: one.name,
              seats: t("search.seatCount", { count: one.seats }),
            }),
            detail: where({ from: one.from[locale], to: one.to[locale] }, left),
            action: t("needs.seeRequest", { count: 1 }),
          };
    }
    case "pay": {
      // Only a booking is paid for; a ride I drive never asks it.
      const booking = ride.kind === "booking" ? ride.booking : null;
      return {
        title:
          booking?.trip.bookingMode === "approval"
            ? t("needs.saidYes", { name: firstNameOf(t, booking.driver) })
            : t("needs.payToKeep"),
        detail: where(endsOf(ride, locale), payByShortText(t, need.by, at)),
        action:
          booking === null
            ? t("needs.seeRide")
            : t("booking.pay", { total: formatMoney(booking.total, locale) }),
      };
    }
    case "tripDay":
      return {
        title: leavesText(t, need.by, at),
        detail: where(endsOf(ride, locale)),
        action: t("needs.seeRide"),
      };
  }
}
