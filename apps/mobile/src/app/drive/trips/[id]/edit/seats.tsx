import { fitLevelWithin } from "@shareride/domain";
import { useState } from "react";
import { useMaxSeats } from "@/beta/config";
import { Notice } from "@/components/notice";
import { Stepper } from "@/components/stepper";
import { Body } from "@/components/text";
import { ChangePartScreen, WithTripToChange, type TripToChange } from "@/driver-trip/change-screen";
import { limitUsedText, tripLoad } from "@/driver-trip/limit";
import { useLanguage } from "@/i18n/language";

/**
 * The seats a published trip offers (spec 6, 3.2): no fewer than are taken
 * on any stretch (rule S5), up to 8. More seats can lower the price level
 * for new bookings (rule P4), and so can what passengers have paid (spec
 * 17), which the screen says before saving.
 */
export default function EditSeatsScreen() {
  const { t } = useLanguage();
  return (
    <WithTripToChange title={t("trip.editSeatsAction")}>
      {(trip) => <EditSeats trip={trip} />}
    </WithTripToChange>
  );
}

function EditSeats({ trip }: { readonly trip: TripToChange }) {
  const { t } = useLanguage();
  const maxSeats = useMaxSeats();
  const [seats, setSeats] = useState(trip.seats);
  // Requests hold seats too (rule S1).
  const taken = Math.max(0, ...trip.segments.map((segment) => segment.seatsTaken));
  const fitted = fitLevelWithin(trip.priceLevel, tripLoad(trip, seats), trip.priceSettings);
  return (
    <ChangePartScreen
      trip={trip}
      title={t("trip.editSeatsAction")}
      change={seats === trip.seats ? null : { kind: "seats", seats }}
    >
      <Stepper
        label={t("trip.seatsOffered")}
        value={seats}
        min={Math.max(1, taken)}
        max={Math.max(maxSeats, trip.seats)}
        onChange={setSeats}
        valueText={t("trip.seats.count", { count: seats })}
        fewerLabel={t("trip.seats.fewer")}
        moreLabel={t("trip.seats.more")}
      />
      {taken > 0 ? <Body align="start">{t("trip.editSeatsTaken", { count: taken })}</Body> : null}
      <Body align="start">{t("trip.seats.help")}</Body>
      {fitted.lowered ? (
        <Notice
          kind="info"
          message={
            fitted.limitedBy === "trip_limit"
              ? limitUsedText(t, fitted.level)
              : t("trip.editSeatsLowers", { seats, level: fitted.level })
          }
        />
      ) : null}
    </ChangePartScreen>
  );
}
