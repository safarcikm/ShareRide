import type { CancelReason, QuickMessage } from "@shareride/domain";
import { carText, type CarFacts } from "./car.ts";
import { formatClock } from "./format.ts";
import type { MessageKey, Translate } from "./translator.ts";

// Quick messages and system lines are stored as keys and put into words in
// the reader's language (spec 7, R7.2): by the app, and by the worker for a
// push.

const quickMessageKeys: Readonly<Record<QuickMessage["key"], MessageKey>> = {
  late: "quick.late",
  atPoint: "quick.atPoint",
  onMyWay: "quick.onMyWay",
  whereAreYou: "quick.whereAreYou",
  seeYou: "quick.seeYou",
  thanks: "quick.thanks",
};

/** "I'm running 10 minutes late", or the other quick messages, in `t`'s language. */
export function quickMessageText(t: Translate, quick: QuickMessage): string {
  return quick.key === "late"
    ? t(quickMessageKeys.late, { minutes: quick.minutes })
    : t(quickMessageKeys[quick.key]);
}

const cancelReasonKeys: Readonly<Record<CancelReason, MessageKey>> = {
  weather: "cancelReason.weather",
  road_closed: "cancelReason.roadClosed",
  car_problem: "cancelReason.carProblem",
  illness: "cancelReason.illness",
  plans_changed: "cancelReason.plansChanged",
  other: "cancelReason.other",
  passenger_asked: "cancelReason.passengerAsked",
  car_smaller: "cancelReason.carSmaller",
  found_another: "cancelReason.foundAnother",
  trip_changed: "cancelReason.tripChanged",
};

/** Why a booking or trip was cancelled, in `t`'s language (spec 6). */
export function cancelReasonText(t: Translate, reason: CancelReason): string {
  return t(cancelReasonKeys[reason]);
}

/** A system line as its reader sees it: a cancellation is theirs or the other person's. */
export type ShownSystemLine =
  | { readonly key: "opened" }
  | {
      readonly key: "departure_changed";
      /** The reader's boarding time before and after, in ISO 8601. */
      readonly from: string;
      readonly to: string;
    }
  | { readonly key: "car_changed"; readonly car: CarFacts }
  | {
      readonly key: "stop_added";
      /** The new stop's name in the reader's language. */
      readonly stop: string;
      /** Its planned time, in ISO 8601. */
      readonly plannedAt: string;
    }
  | {
      readonly key: "stop_removed";
      /** The stop's name in the reader's language. */
      readonly stop: string;
    }
  | {
      readonly key: "cancelled";
      readonly by: "me" | "them";
      readonly reason: CancelReason;
      /** The driver's note, as written; empty for none. */
      readonly note: string;
      /** The driver cancelled the whole trip (spec 6, 3.3). */
      readonly wholeTrip: boolean;
    };

/** A line about what happened to the booking, in `t`'s language; `other` is the other person's first name. */
export function systemLineText(t: Translate, line: ShownSystemLine, other: string): string {
  if (line.key === "opened") return t("chat.opened");
  if (line.key === "departure_changed") return departureChangeText(t, line);
  if (line.key === "car_changed") return t("trip.carChanged", { car: carText(t, line.car) });
  if (line.key === "stop_added") return stopAddedText(t, line);
  if (line.key === "stop_removed") return t("trip.stopRemoved", { stop: line.stop });
  const reason = cancelReasonText(t, line.reason);
  const said = line.wholeTrip
    ? line.by === "me"
      ? t("chat.tripCancelledByMe", { reason })
      : t("chat.tripCancelledByThem", { name: other, reason })
    : line.by === "me"
      ? t("chat.cancelledByMe", { reason })
      : t("chat.cancelledByThem", { name: other, reason });
  return line.note === "" ? said : t("chat.withNote", { line: said, note: line.note });
}

/**
 * "Departure changed from 08:00 to 08:45": the boarding time before and
 * after a move, on Iceland's clock (spec 6, 3.2). A move is at most 2 hours
 * (R6.4), so the time of day says it.
 */
export function departureChangeText(
  t: Translate,
  change: { readonly from: string; readonly to: string },
): string {
  return t("trip.changed", {
    old: formatClock(new Date(change.from)),
    new: formatClock(new Date(change.to)),
  });
}

/** "New stop: N1 Mosfellsbær at 09:20", on Iceland's clock (spec 6, 3.2). */
export function stopAddedText(
  t: Translate,
  added: { readonly stop: string; readonly plannedAt: string },
): string {
  return t("trip.stopAdded", { stop: added.stop, time: formatClock(new Date(added.plannedAt)) });
}
