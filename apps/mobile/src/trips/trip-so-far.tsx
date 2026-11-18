import type { MyTrip, Quote } from "@shareride/contracts";
import type { BookingMode } from "@shareride/domain";
import {
  capitalised,
  formatClock,
  formatDay,
  formatMoney,
  type Locale,
  type Translate,
} from "@shareride/i18n";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/card";
import { Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { stepNumber, type StepName } from "./steps";
import { bookingModeKeys, levelText } from "./texts";

/**
 * What a trip being posted has so far, by the step that sets it: the lines
 * to show, or nothing while that step is still to come.
 */
export type SoFar = {
  readonly [Step in Exclude<StepName, "review">]?: readonly string[] | undefined;
};

const rows = [
  { step: "route", title: "trip.review.route" },
  { step: "time", title: "trip.review.times" },
  { step: "price", title: "trip.review.price" },
  { step: "seats", title: "trip.review.seats" },
] as const;

/**
 * "Your trip so far", beside a step of posting a trip on a wide screen
 * (spec 18, 3.13): a row for each step before the review, with what the
 * trip has, or the step that sets it, in grey, until then. Each row is
 * read out as one thing, such as "Price: Step 3".
 */
export function TripSoFar({ soFar }: { readonly soFar: SoFar }) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <View testID="trip-so-far">
      <Card>
        <Heading>{t("trip.soFar")}</Heading>
        {rows.map(({ step, title }) => {
          const lines = soFar[step];
          const later = t("trip.soFarLater", { step: stepNumber(step) });
          return (
            <View
              key={step}
              accessible
              accessibilityLabel={`${t(title)}: ${lines === undefined ? later : lines.join(", ")}`}
              style={styles.row}
            >
              <Text style={[typography.label, { color: palette.textMuted }]}>{t(title)}</Text>
              {lines === undefined ? (
                <Text style={[typography.body, { color: palette.textMuted }]}>{later}</Text>
              ) : (
                lines.map((line, index) => (
                  <Text
                    key={`${String(index)}-${line}`}
                    style={[typography.body, { color: palette.text }]}
                  >
                    {line}
                  </Text>
                ))
              )}
            </View>
          );
        })}
      </Card>
    </View>
  );
}

/**
 * The route's ends and how many stops lie between them: two lines at most
 * for a route of any length, so the card, and the button under it, stay
 * in a small window.
 */
export function routeSoFar(t: Translate, names: readonly string[]): readonly string[] | undefined {
  const from = names[0];
  const to = names.at(-1);
  if (from === undefined || to === undefined || names.length < 2) return undefined;
  const between = names.length - 2;
  return [
    t("trip.stretch", { from, to }),
    ...(between === 0 ? [] : [t("trip.soFarStops", { count: between })]),
  ];
}

/** The day, and the times of the first and the last stop: "09:00 → 11:00". */
export function timesSoFar(
  t: Translate,
  locale: Locale,
  moments: readonly Date[],
): readonly string[] | undefined {
  const first = moments[0];
  const last = moments.at(-1);
  if (first === undefined || last === undefined) return undefined;
  return [
    capitalised(formatDay(first, locale), locale),
    t("trip.stretch", { from: formatClock(first), to: formatClock(last) }),
  ];
}

/** The price level with the whole route's price, as the review has it, once it is quoted. */
export function priceSoFar(
  t: Translate,
  locale: Locale,
  quote: Quote | null,
  level: number,
): readonly string[] {
  return [
    quote === null
      ? levelText(t, level)
      : t("trip.review.priceLine", {
          level: levelText(t, quote.priceLevel),
          price: formatMoney(quote.wholeRoutePrice, locale),
        }),
  ];
}

export function seatsSoFar(t: Translate, seats: number, mode: BookingMode): readonly string[] {
  return [t("trip.seats.count", { count: seats }), t(bookingModeKeys[mode].title)];
}

/**
 * What a saved draft has, as `step` shows it; the step then puts what is
 * being chosen on it in its own row. The route is there from the start,
 * and the times once saved. A draft has a price level and seats before
 * the driver has chosen them, so those show only after their own steps,
 * or when the step was opened from the review, where all is chosen.
 */
export function savedSoFar(
  t: Translate,
  locale: Locale,
  trip: MyTrip,
  step: StepName,
  fromReview: boolean,
  quote: Quote | null,
): SoFar {
  const chosen = (other: StepName) => fromReview || stepNumber(other) < stepNumber(step);
  const moments = trip.stops.flatMap((stop) =>
    stop.plannedAt === null ? [] : [new Date(stop.plannedAt)],
  );
  return {
    route: routeSoFar(
      t,
      trip.stops.map((stop) => stop.meetingPoint.name[locale]),
    ),
    time: moments.length < trip.stops.length ? undefined : timesSoFar(t, locale, moments),
    price: chosen("price") ? priceSoFar(t, locale, quote, trip.priceLevel) : undefined,
    seats: chosen("seats") ? seatsSoFar(t, trip.seats, trip.bookingMode) : undefined,
  };
}

const styles = StyleSheet.create({ row: { gap: spacing.xs } });
