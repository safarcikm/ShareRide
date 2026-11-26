import type { MyTrip } from "@shareride/contracts";
import { useLocalSearchParams } from "expo-router";
import { BackButton } from "@/components/back-button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Title } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { isChangeable } from "@/driver-trip/changes";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { ShareRidePanel } from "@/sharing/share-ride-panel";
import { TripSummary } from "@/trips/trip-summary";
import { Loading, useDraft } from "@/trips/use-draft";

/** The driver's trip page, as a link's address. */
type TripPage = {
  readonly pathname: "/drive/trips/[id]";
  readonly params: { readonly id: string };
};

/**
 * Share this ride (spec 28, 3.2), from My trips and the driver's trip
 * page: the trip and the panel, for a published trip that has not left
 * (R28.4). Any other says it cannot be shared, with a link to the trip; one
 * that is not the driver's, or not there, says so and links to My trips.
 */
export default function ShareRideScreen() {
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { value: result, reload } = useDraft(id);
  const tripPage: TripPage = { pathname: "/drive/trips/[id]", params: { id } };
  return (
    <Screen>
      <BackButton fallback={tripPage} />
      <Title>{t("shareRide.heading")}</Title>
      {result?.ok === false && result.status === 404 ? (
        <>
          <Notice message={t("trip.notFound")} />
          <TextLink label={t("trip.published.seeTrips")} href="/drive/trips" />
        </>
      ) : result === undefined || !result.ok ? (
        <Loading failure={result} onRetry={reload} />
      ) : (
        <Shareable trip={result.data} tripPage={tripPage} />
      )}
    </Screen>
  );
}

function Shareable({ trip, tripPage }: { readonly trip: MyTrip; readonly tripPage: TripPage }) {
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
      <TripSummary trip={trip} />
      <ShareRidePanel trip={trip} heading={false} />
    </>
  );
}
