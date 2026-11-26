import { formatDay, type Locale, type Translate } from "@shareride/i18n";
import { timesSoFar, type SoFarRow } from "./trip-so-far";

/**
 * The Route row of "Check and publish" (spec 31, 3.11, item 3): the two
 * ends, with the stops between them counted, "Mjódd to Vík, with 5 stops on
 * the way". On screen the words between the ends are the language's own
 * (`trip.review.ends`): Icelandic has an arrow there, as a name after "til"
 * would need another case; read out, it is the word, as everywhere.
 */
export function routeChecked(t: Translate, names: readonly string[]): SoFarRow {
  const ends = { from: names[0] ?? "", to: names.at(-1) ?? "" };
  const between = names.length - 2;
  const counted = (route: string) =>
    between > 0 ? t("trip.review.routeWithStops", { route, count: between }) : route;
  return {
    lines: [counted(t("trip.review.ends", ends))],
    spoken: counted(t("trip.stretchSpoken", ends)),
  };
}

/**
 * The Time row: "Sunday 15 November, 09:00 to 11:00" in one line. A ride
 * that ends on a later day has a line for each day, and is read out as one
 * thing, from the first to the last. Nothing for a ride with no times.
 */
export function timeChecked(
  t: Translate,
  locale: Locale,
  moments: readonly Date[],
): SoFarRow | undefined {
  const times = timesSoFar(t, locale, moments);
  const first = moments[0];
  const last = moments.at(-1);
  if (times === undefined || first === undefined || last === undefined) return undefined;
  const oneDay = formatDay(first, locale) === formatDay(last, locale);
  return oneDay ? { lines: [times.spoken], spoken: times.spoken } : times;
}
