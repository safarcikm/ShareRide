import type { MyTrip } from "@shareride/contracts";
import { router, useLocalSearchParams } from "expo-router";
import { Button } from "@/components/button";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { isChangeable } from "@/driver-trip/changes";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { NotificationsPrompt } from "@/notifications/notifications-prompt";
import { ShareRidePanel } from "@/sharing/share-ride-panel";
import { tripHref } from "@/trip-details/trip-link";
import { TripSummary } from "@/trips/trip-summary";
import { Loading, useDraft } from "@/trips/use-draft";

/**
 * Published (spec 3, screen 10): Share this ride right after the trip
 * (spec 28, 3.2), the prompt to turn on notifications (spec 7, 3.6.2), and
 * the trip's page as passengers see it. Posting the return trip comes with
 * changes to trips (spec 6).
 */
export default function PublishedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { value: result, reload } = useDraft(id);
  return (
    <Screen>
      {result === undefined || !result.ok ? (
        <Loading failure={result} onRetry={reload} />
      ) : (
        <Published trip={result.data} />
      )}
    </Screen>
  );
}

function Published({ trip }: { readonly trip: MyTrip }) {
  const { t } = useLanguage();
  const whole = { board: 0, alight: trip.stops.length - 1 };
  return (
    <>
      <Title>{t("trip.published.title")}</Title>
      <Body>
        {trip.bookingMode === "approval"
          ? t("trip.published.approval")
          : t("trip.published.instant")}
      </Body>
      <TripSummary trip={trip} />
      {/* Opened again once the trip has left, there is nothing to share (R28.4). */}
      {isChangeable(trip, now()) ? <ShareRidePanel trip={trip} /> : null}
      <NotificationsPrompt occasion={`posted:${trip.id}`} />
      <TextLink label={t("trip.published.see")} href={tripHref(trip.id, whole)} />
      <Button
        label={t("trip.published.seeTrips")}
        onPress={() => {
          router.replace("/drive/trips");
        }}
      />
    </>
  );
}
