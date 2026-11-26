import { myTripsRoute, type MyTrip } from "@shareride/contracts";
import { capitalised, formatClock, formatDay } from "@shareride/i18n";
import { router } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card, cardCornerRoom } from "@/components/card";
import { Screen } from "@/components/screen";
import { Tag } from "@/components/tag";
import { PuffinByPin } from "@/components/puffin-scenes";
import { Body, Heading, Title } from "@/components/text";
import { isChangeable } from "@/driver-trip/changes";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { ShareTripCorner } from "@/sharing/share-corner";
import { sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { resumeStep, stepHref } from "@/trips/steps";
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
  const load = useCallback(
    () => session.call(myTripsRoute, { query: { when: "upcoming" } }),
    [session],
  );
  const { value: result, reload } = useLoadedOnFocus(load);
  const trips = result?.ok === true ? result.data.trips : null;
  const drafts = trips?.filter((trip) => trip.status === "draft") ?? [];
  // Upcoming lists a trip until its last stop, so one under way is here too (spec 8, R8.1).
  const published = trips?.filter((trip) => trip.status !== "draft") ?? [];

  return (
    <Screen>
      <BackButton fallback="/offer" />
      <Title>{t("trip.myTrips")}</Title>
      <Button label={t("trip.post")} onPress={postTrip} />
      {trips === null ? (
        <Loading failure={result?.ok === false ? result : undefined} onRetry={reload} />
      ) : trips.length === 0 ? (
        <>
          <PuffinByPin height={sizes.scenePuffin} />
          <Body>{t("trip.mine.empty")}</Body>
        </>
      ) : (
        <>
          {drafts.length === 0 ? null : <Heading>{t("trip.mine.drafts")}</Heading>}
          {drafts.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onPress={() => {
                router.push(stepHref(trip.id, resumeStep(trip)));
              }}
            />
          ))}
          {published.length === 0 ? null : <Heading>{t("trip.mine.published")}</Heading>}
          {published.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onPress={() => {
                router.push({ pathname: "/drive/trips/[id]", params: { id: trip.id } });
              }}
            />
          ))}
        </>
      )}
    </Screen>
  );
}

/**
 * A trip's route and when it leaves. A draft opens to carry on with it; a
 * published trip opens the driver's trip page, with the requests waiting
 * on it counted here (spec 5, 3.3). Until it leaves, a published trip has
 * the share icon in its corner (spec 28, 3.1).
 */
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
  const requests =
    trip.openRequests === 0 ? null : t("trip.mine.requests", { count: trip.openRequests });
  const shareable = isChangeable(trip, now());
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={[route, when, seats, requests].filter((part) => part !== null).join(", ")}
      {...(shareable ? { corner: <ShareTripCorner tripId={trip.id} route={route} /> } : {})}
    >
      <Text style={[typography.heading, shareable && styles.besideCorner, { color: palette.text }]}>
        {route}
      </Text>
      <Text style={[typography.small, { color: palette.textMuted }]}>{when}</Text>
      <Text style={[typography.small, { color: palette.textMuted }]}>{seats}</Text>
      {requests === null ? null : (
        <View style={styles.row}>
          <Tag kind="info" label={requests} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  besideCorner: { marginRight: cardCornerRoom },
});
