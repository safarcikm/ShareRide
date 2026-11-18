import type { AdminDeclines } from "@shareride/contracts";
import type { Locale, Translate } from "@shareride/i18n";

/** "Declined 3 of 10 requests (30%)" over the last 90 days (spec 9, 3.4.5). */
export function declinesText(
  t: Translate,
  locale: Locale,
  declines: Pick<AdminDeclines, "answered" | "declined">,
): string {
  const share = declines.answered === 0 ? 0 : declines.declined / declines.answered;
  const percent = new Intl.NumberFormat(locale === "is" ? "is-IS" : "en-GB", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(share);
  return t("admin.users.declineLine", {
    declined: declines.declined,
    answered: declines.answered,
    percent,
  });
}

/** Why they declined, by the reason the driver picked (R5.7). */
export function reasonsText(t: Translate, reasons: AdminDeclines["reasons"]): string {
  return t("admin.users.reasonsLine", {
    plansChanged: reasons.plans_changed,
    luggage: reasons.luggage,
    other: reasons.other,
    none: reasons.none,
  });
}
