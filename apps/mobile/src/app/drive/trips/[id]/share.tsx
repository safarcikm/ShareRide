import { listVehiclesRoute, type MyTrip, type Vehicle } from "@shareride/contracts";
import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { useSession } from "@/auth/session";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { TextLink } from "@/components/text-link";
import { isChangeable } from "@/driver-trip/changes";
import { DriverRideTicket } from "@/driver-trip/ride-ticket";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { useLoaded } from "@/lib/use-loaded";
import { ShareRidePanel } from "@/sharing/share-ride-panel";
import { Loading, useDraft } from "@/trips/use-draft";

/** The driver's trip page, as a link's address. */
type TripPage = {
  readonly pathname: "/drive/trips/[id]";
  readonly params: { readonly id: string };
};

/**
 * Share this ride (spec 28, 3.2), from the page of a ride I drive: the
 * title at the left over the ride as its ticket (spec 31, 3.19;
 * R31.2), then the panel, for a published trip that has not left (R28.4).
 * Any other says it cannot be shared, with a link to the trip; one that is
 * not the driver's, or not there, says so and links to My rides.
 */
export default function ShareRideScreen() {
  const { t } = useLanguage();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { value: result, reload } = useDraft(id);
  // For the car on the ticket; the screen stands without it.
  const loadCars = useCallback(() => session.call(listVehiclesRoute, {}), [session]);
  const { value: cars } = useLoaded(loadCars);
  const tripPage: TripPage = { pathname: "/drive/trips/[id]", params: { id } };
  return (
    <Screen>
      <ScreenHead title={t("shareRide.heading")} back={tripPage} />
      {result?.ok === false && result.status === 404 ? (
        <>
          <Notice message={t("trip.notFound")} />
          <TextLink label={t("trip.published.seeTrips")} href="/my-rides" />
        </>
      ) : result === undefined || !result.ok ? (
        <Loading failure={result} onRetry={reload} />
      ) : cars === undefined ? (
        <Loading />
      ) : (
        <Shareable
          trip={result.data}
          car={
            cars.ok
              ? (cars.data.vehicles.find((known) => known.id === result.data.vehicleId) ?? null)
              : null
          }
          tripPage={tripPage}
        />
      )}
    </Screen>
  );
}

function Shareable({
  trip,
  car,
  tripPage,
}: {
  readonly trip: MyTrip;
  readonly car: Vehicle | null;
  readonly tripPage: TripPage;
}) {
  const { t } = useLanguage();
  if (!isChangeable(trip, now())) {
    return (
      <>
        <Notice kind="info" message={t("shareRide.notShareable")} />
        <TextLink label={t("shareRide.backToTrip")} href={tripPage} />
      </>
    );
  }
  return (
    <>
      <DriverRideTicket trip={trip} car={car} />
      <ShareRidePanel trip={trip} heading={false} />
    </>
  );
}
