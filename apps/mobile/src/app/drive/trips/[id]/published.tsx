import type { MyTrip } from "@shareride/contracts";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { Button } from "@/components/button";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Title } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { isChangeable } from "@/driver-trip/changes";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { MyRideTicket } from "@/my-rides/my-ride-ticket";
import { rideOfTrip, type Ride } from "@/my-rides/rides";
import { NotificationsPrompt } from "@/notifications/notifications-prompt";
import { ShareRidePanel } from "@/sharing/share-ride-panel";
import { tripHref } from "@/trip-details/trip-link";
import { resumeStep, stepHref } from "@/trips/steps";
import { Loading, useDraft } from "@/trips/use-draft";

/**
 * Published (spec 3, screen 10; spec 31, 3.19): the ride as the ticket it
 * is in My rides, which opens it; Share this ride right after it (spec 28,
 * 3.2); the prompt to turn on notifications (spec 7, 3.6.2); the ride's
 * page as passengers see it; and "See my rides" in the bar, the screen's
 * one main button (R31.1). Only a ride that is published says so: a draft
 * opens where it was left, and a cancelled ride its own page.
 */
export default function PublishedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useLanguage();
  const { value: result, reload } = useDraft(id);
  if (result === undefined || !result.ok) {
    return (
      <Screen>
        <Loading failure={result} onRetry={reload} />
      </Screen>
    );
  }
  const trip = result.data;
  const ride = rideOfTrip(trip);
  if (ride === null) return <Redirect href={stepHref(trip.id, resumeStep(trip))} />;
  if (trip.status === "cancelled") {
    return <Redirect href={{ pathname: "/drive/trips/[id]", params: { id: trip.id } }} />;
  }
  return (
    <Screen
      footer={
        <Button
          main
          label={t("trip.published.seeTrips")}
          onPress={() => {
            router.replace("/my-rides");
          }}
        />
      }
    >
      <Published trip={trip} ride={ride} />
    </Screen>
  );
}

function Published({ trip, ride }: { readonly trip: MyTrip; readonly ride: Ride }) {
  const { t } = useLanguage();
  const whole = { board: 0, alight: trip.stops.length - 1 };
  return (
    <>
      {/* The outcome of pressing Publish, so focus starts here. */}
      <TakesFocus>
        <Title>{t("trip.published.title")}</Title>
      </TakesFocus>
      <Body>
        {trip.bookingMode === "approval"
          ? t("trip.published.approval")
          : t("trip.published.instant")}
      </Body>
      <MyRideTicket ride={ride} at={now()} />
      {/* Opened again once the trip has left, there is nothing to share (R28.4). */}
      {isChangeable(trip, now()) ? <ShareRidePanel trip={trip} /> : null}
      <NotificationsPrompt occasion={`posted:${trip.id}`} />
      <TextLink label={t("trip.published.see")} href={tripHref(trip.id, whole)} />
    </>
  );
}
