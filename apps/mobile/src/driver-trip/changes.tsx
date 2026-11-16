// What the screens that change a published trip share (spec 6, 3.2): when
// it can change, its heading, its stops' times, and the rules a change breaks.
import type { CallFailure } from "@shareride/api-client";
import type { MyTrip } from "@shareride/contracts";
import { capitalised, formatClock, formatDay, type Locale, type Translate } from "@shareride/i18n";
import { router } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { problemText, routeText, stopNameAt } from "@/trips/texts";

/** The driver's trip page; `params` such as what just changed. */
export const tripHref = (id: string, params: Readonly<Record<string, string>> = {}) => ({
  pathname: "/drive/trips/[id]" as const,
  params: { id, ...params },
});

/** Published and not yet left: from the planned departure, nothing changes (R6.1). */
export function isChangeable(trip: MyTrip, now: Date): trip is MyTrip & { departsAt: string } {
  return (
    trip.status === "published" &&
    trip.departsAt !== null &&
    new Date(trip.departsAt).getTime() > now.getTime()
  );
}

/** The trip's day and time and its route, above the screen's title. */
export function TripHeading({ trip, title }: { readonly trip: MyTrip; readonly title: string }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const departure = trip.departsAt === null ? null : new Date(trip.departsAt);
  return (
    <View>
      <Text style={[typography.small, { color: palette.textMuted }]}>
        {departure === null
          ? null
          : `${capitalised(
              t("trip.mine.when", {
                day: formatDay(departure, locale),
                time: formatClock(departure),
              }),
              locale,
            )} · `}
        {routeText(t, locale, trip)}
      </Text>
      <Title align="start">{title}</Title>
    </View>
  );
}

/** While the trip loads, or why it did not, on a screen that changes it. */
export function NotLoaded({
  id,
  title,
  failure,
  onRetry,
}: {
  readonly id: string;
  readonly title: string;
  /** Undefined while loading. */
  readonly failure: CallFailure | undefined;
  readonly onRetry: () => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const back = <BackButton fallback={tripHref(id)} />;
  if (failure === undefined) {
    return (
      <Screen>
        {back}
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  return (
    <Screen>
      {back}
      <Title>{title}</Title>
      <Notice
        message={
          failure.status === 404
            ? t("trip.notFound")
            : failure.error.code === "network_error"
              ? errorText(t, failure)
              : t("driverTrip.failed")
        }
      />
      <Button variant="secondary" label={t("common.retry")} onPress={onRetry} />
    </Screen>
  );
}

/** A trip that has left or was cancelled: nothing to change, and the way back to it. */
export function NotChangeable({ trip, title }: { readonly trip: MyTrip; readonly title: string }) {
  const { t } = useLanguage();
  return (
    <Screen>
      <BackButton fallback={tripHref(trip.id)} />
      <TripHeading trip={trip} title={title} />
      <Notice message={t("trip.notChangeable")} />
      <Button
        variant="secondary"
        label={t("booking.backToTrip")}
        onPress={() => {
          router.dismissTo(tripHref(trip.id));
        }}
      />
    </Screen>
  );
}

/**
 * Each stop's time and name, after the day of the first: the day again on
 * a stop that falls on a later one.
 */
export function timeLines(
  t: Translate,
  locale: Locale,
  trip: { readonly stops: readonly Pick<MyTrip["stops"][number], "meetingPoint">[] },
  times: readonly Date[],
): string[] {
  const first = times[0];
  const firstDay = first === undefined ? "" : formatDay(first, locale);
  const stops = trip.stops.map((stop, index) => {
    const name = stop.meetingPoint.name[locale];
    const moment = times[index];
    if (moment === undefined) return name;
    const time = formatClock(moment);
    const day = formatDay(moment, locale);
    return day === firstDay
      ? t("trip.review.stopTime", { time, name })
      : t("trip.review.stopTimeOnDay", { time, name, day });
  });
  return [capitalised(firstDay, locale), ...stops];
}

/**
 * Why the server refused a change, once each: the rules it breaks
 * (`change_not_allowed`), with the departures the bookings allow for a
 * move too far (R6.4); or that the trip can no longer change.
 */
export function refusalText(
  t: Translate,
  locale: Locale,
  trip: MyTrip,
  failure: CallFailure,
): string {
  if (failure.error.code === "trip_not_changeable") return t("trip.notChangeable");
  if (failure.error.code !== "change_not_allowed") return errorText(t, failure);
  const names = trip.stops.map((stop) => stop.meetingPoint.name[locale]);
  const window = failure.error.departureWindow;
  const texts = (failure.error.details ?? []).map((detail) =>
    detail.issue === "move_too_far" && window !== undefined
      ? t("trip.moveTooFar", {
          earliest: formatClock(new Date(window.earliest)),
          latest: formatClock(new Date(window.latest)),
        })
      : problemText(t, detail.issue, stopNameAt(names, detail.path)),
  );
  return [...new Set(texts)].join(" ") || errorText(t, failure);
}
