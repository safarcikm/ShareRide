import type { QuickMessage, SystemLineKey } from "@shareride/domain";
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

const systemLineKeys: Readonly<Record<SystemLineKey, MessageKey>> = {
  opened: "chat.opened",
};

/** A line about what happened to the booking, in `t`'s language. */
export function systemLineText(t: Translate, key: SystemLineKey): string {
  return t(systemLineKeys[key]);
}
