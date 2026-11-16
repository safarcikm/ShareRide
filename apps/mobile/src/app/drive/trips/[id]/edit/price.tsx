import {
  defaultTripSettings,
  highestPriceLevel,
  routePrice,
  segmentPrice,
} from "@shareride/domain";
import { useState } from "react";
import { Body } from "@/components/text";
import { ChangePartScreen, WithTripToChange, type TripToChange } from "@/driver-trip/change-screen";
import { useLanguage } from "@/i18n/language";
import { PriceCard } from "@/trips/price-card";

/**
 * A new price level for a published trip (spec 6, 3.2; rule P1): for new
 * bookings only, with each stretch's new price before saving, worked out
 * by the same rules the server saves it with (P3, P4).
 */
export default function EditPriceScreen() {
  const { t } = useLanguage();
  return (
    <WithTripToChange title={t("trip.editPriceAction")}>
      {(trip) => <EditPrice trip={trip} />}
    </WithTripToChange>
  );
}

function EditPrice({ trip }: { readonly trip: TripToChange }) {
  const { locale, t } = useLanguage();
  const highest = highestPriceLevel(trip.seats, defaultTripSettings);
  const [level, setLevel] = useState(trip.priceLevel);
  // As publishing priced each stretch from its distance (rules P3, P4).
  const prices = trip.segments.map((segment) =>
    segmentPrice(segment.distanceM, level, trip.seats, defaultTripSettings),
  );
  return (
    <ChangePartScreen
      trip={trip}
      title={t("trip.editPriceAction")}
      change={level === trip.priceLevel ? null : { kind: "priceLevel", priceLevel: level }}
    >
      <Body align="start">{t("trip.editPriceHelp")}</Body>
      <PriceCard
        names={trip.stops.map((stop) => stop.meetingPoint.name[locale])}
        prices={prices}
        whole={routePrice(prices)}
        pricedLevel={level}
        level={level}
        highest={highest}
        step={defaultTripSettings.priceLevelStep}
        onLevel={setLevel}
      />
    </ChangePartScreen>
  );
}
