import type { CancelReason, QuickMessage } from "@shareride/domain";
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
