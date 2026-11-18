import type { AdminStop } from "@shareride/contracts";
import type { BookingMode, DeclineReason } from "@shareride/domain";
import type { Locale, MessageKey, Translate } from "@shareride/i18n";
import { atText } from "../reports/texts.ts";

/** Why a driver declined a request, in the operator's words (R5.7). */
export const declineReasonKeys = {
  plans_changed: "admin.trips.declineReason.plans_changed",
  luggage: "admin.trips.declineReason.luggage",
  other: "admin.trips.declineReason.other",
} as const satisfies Record<DeclineReason, MessageKey>;

export const bookingModeKeys = {
  approval: "admin.trips.bookingMode.approval",
  instant: "admin.trips.bookingMode.instant",
} as const satisfies Record<BookingMode, MessageKey>;

/** "BSÍ – Hof, Akureyri", in the console's language. */
export function routeText(
  t: Translate,
  locale: Locale,
  part: { readonly from: AdminStop; readonly to: AdminStop },
): string {
  return t("admin.trips.route", { from: part.from.name[locale], to: part.to.name[locale] });
}

/** When a trip or stop is planned, or that it has no time yet. */
export function plannedText(t: Translate, locale: Locale, at: string | null): string {
  return at === null ? t("admin.trips.noTime") : atText(t, locale, at);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether the operator typed a whole ID, as the console shows them. */
export const isId = (text: string) => uuidPattern.test(text.trim());
