import type { AdminConversationMessage } from "@shareride/contracts";
import type { DisputeKind, DisputeOutcome } from "@shareride/domain";
import {
  formatClock,
  formatDayAndMonth,
  quickMessageText,
  systemLineText,
  type Locale,
  type MessageKey,
  type ShownSystemLine,
  type Translate,
} from "@shareride/i18n";

export const disputesPath = "/admin/disputes";

export const kindKeys = {
  no_show: "admin.disputes.kind.no_show",
  driver_absent: "admin.disputes.kind.driver_absent",
} as const satisfies Record<DisputeKind, MessageKey>;

interface OutcomeTexts {
  /** What happened, as the operator chooses it. */
  readonly label: MessageKey;
  /** What it does to the booking, the money and reliability (spec 8, 3.3 to 3.5). */
  readonly effect: MessageKey;
}

// Each kind's outcomes, as the domain's `operatorOutcomes` has them
// (decisions 4 and 5); the system's decisions are `stands`.
const outcomeKeys: Readonly<Record<DisputeKind, Partial<Record<DisputeOutcome, OutcomeTexts>>>> = {
  no_show: {
    stands: {
      label: "admin.disputes.outcome.no_show.stands",
      effect: "admin.disputes.effect.no_show.stands",
    },
    rode: {
      label: "admin.disputes.outcome.no_show.rode",
      effect: "admin.disputes.effect.no_show.rode",
    },
    left_behind: {
      label: "admin.disputes.outcome.no_show.left_behind",
      effect: "admin.disputes.effect.no_show.left_behind",
    },
  },
  driver_absent: {
    stands: {
      label: "admin.disputes.outcome.driver_absent.stands",
      effect: "admin.disputes.effect.driver_absent.stands",
    },
    rode: {
      label: "admin.disputes.outcome.driver_absent.rode",
      effect: "admin.disputes.effect.driver_absent.rode",
    },
    passenger_absent: {
      label: "admin.disputes.outcome.driver_absent.passenger_absent",
      effect: "admin.disputes.effect.driver_absent.passenger_absent",
    },
  },
};

/** An outcome of a report of `kind`, in the operator's words, and what it does. */
export function outcomeTexts(kind: DisputeKind, outcome: DisputeOutcome): OutcomeTexts {
  const texts = outcomeKeys[kind][outcome];
  if (texts === undefined) throw new Error(`A ${kind} report never ends as ${outcome}.`);
  return texts;
}

/** A side's first name, or that they have left ShareRide (spec 11, 3.5). */
export const nameOf = (t: Translate, person: { readonly firstName: string | null }) =>
  person.firstName ?? t("people.formerMember");

/** "15 November at 10:15", on Iceland's clock. */
export function atText(t: Translate, locale: Locale, at: string): string {
  const moment = new Date(at);
  return t("admin.disputes.at", {
    date: formatDayAndMonth(moment, locale),
    time: formatClock(moment),
  });
}

/** Who wrote a message of the booking's conversation. */
export function senderText(
  t: Translate,
  from: AdminConversationMessage["from"],
  names: { readonly driver: string; readonly passenger: string },
): string {
  if (from === "system") return t("admin.disputes.from.system");
  return from === "driver"
    ? t("admin.disputes.from.driver", { name: names.driver })
    : t("admin.disputes.from.passenger", { name: names.passenger });
}

/**
 * A message of the booking's conversation in the operator's language: text
 * as written, quick messages and system lines translated. System lines come
 * worded as for the driver (`by: "me"`), so each line that names who did it
 * names the driver or the passenger instead.
 */
export function messageText(
  t: Translate,
  locale: Locale,
  message: AdminConversationMessage,
  names: { readonly driver: string; readonly passenger: string },
): string {
  if (message.kind === "erased") return t("chat.messageDeleted");
  const { system } = message;
  if (system !== null) {
    if (system.key === "checked_in" || system.key === "cancelled") {
      const name = system.by === "me" ? names.driver : names.passenger;
      return systemLineText(t, { ...system, by: "them" }, name);
    }
    const line: ShownSystemLine =
      system.key === "stop_added" || system.key === "stop_removed"
        ? { ...system, stop: system.stop[locale] }
        : system;
    return systemLineText(t, line, names.passenger);
  }
  if (message.quick !== null) return quickMessageText(t, message.quick);
  return message.text ?? "";
}
