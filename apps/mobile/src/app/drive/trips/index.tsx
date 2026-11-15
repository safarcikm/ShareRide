import { myTripsRoute, type MyTrip } from "@shareride/contracts";
import { capitalised, formatClock, formatDay } from "@shareride/i18n";
import { router } from "expo-router";
import { useCallback } from "react";
import { Text } from "react-native";
import { useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { Body, Heading, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { stepHref } from "@/trips/steps";
import { routeText } from "@/trips/texts";
import { Loading } from "@/trips/use-draft";

const postTrip = () => {
  router.push("/drive/trips/new");
};

/**
 * My trips (spec 3, 3.8.4): drafts, most recently changed first, which open
 * where the driver left off, then published trips, soonest first.
 */
export default function MyTripsScreen() {
  const { t } = useLanguage();
  const session = useSession();
  const load = useCallback(() => session.call(myTripsRoute, {}), [session]);
  const { value: result, reload } = useLoadedOnFocus(load);
  const trips = result?.ok === true ? result.data.trips : null;
  const drafts = trips?.filter((trip) => trip.status === "draft") ?? [];
  const published = trips?.filter((trip) => trip.status === "published") ?? [];

  return (
    <Screen>
      <BackButton fallback="/drive" />
      <Title>{t("trip.myTrips")}</Title>
      <Button label={t("trip.post")} onPress={postTrip} />
      {trips === null ? (
        <Loading failure={result?.ok === false ? result : undefined} onRetry={reload} />
      ) : trips.length === 0 ? (
        <Body>{t("trip.mine.empty")}</Body>
      ) : (
        <>
          {drafts.length === 0 ? null : <Heading>{t("trip.mine.drafts")}</Heading>}
          {drafts.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onPress={() => {
                // Without a departure the next thing to do is the date.
                router.push(stepHref(trip.id, trip.departsAt === null ? "time" : "review"));
              }}
            />
          ))}
          {published.length === 0 ? null : <Heading>{t("trip.mine.published")}</Heading>}
          {published.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </>
      )}
    </Screen>
  );
}

/** A trip's route and when it leaves; a draft opens to carry on with it. */
function TripCard({ trip, onPress }: { readonly trip: MyTrip; readonly onPress?: () => void }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const route = routeText(t, locale, trip);
  const departure = trip.departsAt === null ? null : new Date(trip.departsAt);
  const when =
    departure === null
      ? t("trip.mine.draftLine")
      : capitalised(
          t("trip.mine.when", { day: formatDay(departure, locale), time: formatClock(departure) }),
          locale,
        );
  const seats = t("trip.seats.count", { count: trip.seats });
  return (
    <Card onPress={onPress} accessibilityLabel={[route, when, seats].join(", ")}>
      <Text style={[typography.heading, { color: palette.text }]}>{route}</Text>
      <Text style={[typography.small, { color: palette.textMuted }]}>{when}</Text>
      <Text style={[typography.small, { color: palette.textMuted }]}>{seats}</Text>
    </Card>
  );
}
