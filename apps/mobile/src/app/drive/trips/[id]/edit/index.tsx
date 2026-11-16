import { myTripRoute } from "@shareride/contracts";
import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { Body } from "@/components/text";
import {
  isChangeable,
  NotChangeable,
  NotLoaded,
  timeLines,
  TripHeading,
  tripHref,
} from "@/driver-trip/changes";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { SummarySection } from "@/trips/summary-section";

/**
 * Edit trip (spec 6, 3.2; screen 3): what the published trip holds, one
 * part at a time, each opening its own screen; before saving, that screen
 * shows what the change means for passengers. For now the time; milestone
 * 6's PR 5b adds the seats, the price level, the car, the booking mode and
 * the details. It loads again each time it comes into view.
 */
export default function EditTripScreen() {
  const { locale, t } = useLanguage();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => session.call(myTripRoute, { params: { id } }), [session, id]);
  const { value: trip, reload } = useLoadedOnFocus(load);

  if (trip === undefined || !trip.ok) {
    return <NotLoaded id={id} title={t("trip.edit")} failure={trip} onRetry={reload} />;
  }
  if (!isChangeable(trip.data, now())) {
    return <NotChangeable trip={trip.data} title={t("trip.edit")} />;
  }
  const { departsAt } = trip.data;
  const times = trip.data.stops.map((stop) => new Date(stop.plannedAt ?? departsAt));
  return (
    <Screen>
      <BackButton fallback={tripHref(id)} />
      <TripHeading trip={trip.data} title={t("trip.edit")} />
      <Body align="start">{t("trip.editIntro")}</Body>
      <Card>
        <SummarySection
          title={t("trip.editTime")}
          lines={timeLines(t, locale, trip.data, times)}
          link={{
            label: t("trip.editTimeAction"),
            href: { pathname: "/drive/trips/[id]/edit/time", params: { id } },
          }}
        />
      </Card>
    </Screen>
  );
}
