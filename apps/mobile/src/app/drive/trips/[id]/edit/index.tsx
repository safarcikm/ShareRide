import { myTripRoute } from "@shareride/contracts";
import { routePrice } from "@shareride/domain";
import { formatMoney } from "@shareride/i18n";
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
import { bookingModeKeys, levelText, preferenceTexts } from "@/trips/texts";

/**
 * Edit trip (spec 6, 3.2; screen 3): what the published trip holds, one
 * part at a time, each opening its own screen; before saving, that screen
 * shows what the change means for passengers. The time, the price, the
 * seats, how people book, and the preferences and note; the car follows
 * in milestone 6's PR 5c and the stops in PR 6. It loads again each time
 * it comes into view.
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
  const { priceLevel, seats, bookingMode, preferences, note } = trip.data;
  const part = (name: "time" | "price" | "seats" | "booking" | "details") => ({
    pathname: `/drive/trips/[id]/edit/${name}` as const,
    params: { id },
  });
  return (
    <Screen>
      <BackButton fallback={tripHref(id)} />
      <TripHeading trip={trip.data} title={t("trip.edit")} />
      <Body align="start">{t("trip.editIntro")}</Body>
      <Card>
        <SummarySection
          title={t("trip.editTime")}
          lines={timeLines(t, locale, trip.data, times)}
          link={{ label: t("trip.editTimeAction"), href: part("time") }}
        />
        <SummarySection
          title={t("trip.review.price")}
          lines={[
            t("trip.review.priceLine", {
              level: levelText(t, priceLevel),
              price: formatMoney(routePrice(trip.data.segments.map(({ price }) => price)), locale),
            }),
          ]}
          link={{ label: t("trip.editPriceAction"), href: part("price") }}
        />
        <SummarySection
          title={t("trip.editSeats")}
          lines={[t("trip.seats.count", { count: seats })]}
          link={{ label: t("trip.editSeatsAction"), href: part("seats") }}
        />
        <SummarySection
          title={t("trip.bookingMode.title")}
          lines={[t(bookingModeKeys[bookingMode].title)]}
          link={{ label: t("trip.editBookingAction"), href: part("booking") }}
        />
        <SummarySection
          title={t("trip.editDetails")}
          lines={[...preferenceTexts(t, preferences), note === "" ? t("trip.review.noNote") : note]}
          link={{ label: t("trip.editDetailsAction"), href: part("details") }}
        />
      </Card>
    </Screen>
  );
}
