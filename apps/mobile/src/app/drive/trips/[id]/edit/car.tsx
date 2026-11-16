import { listVehiclesRoute } from "@shareride/contracts";
import { useCallback, useState } from "react";
import { ActivityIndicator } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Body } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { ChangePartScreen, WithTripToChange, type TripToChange } from "@/driver-trip/change-screen";
import { useLanguage } from "@/i18n/language";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { usePalette } from "@/theme/use-palette";
import { CarChoices } from "@/trips/car-choices";

/**
 * The car of a published trip (spec 6, 3.2): another of the driver's
 * cars, which each passenger who booked is told of. "Add a car" comes back
 * here, and the cars load again.
 */
export default function EditCarScreen() {
  const { t } = useLanguage();
  return (
    <WithTripToChange title={t("trip.editCarAction")}>
      {(trip) => <EditCar trip={trip} />}
    </WithTripToChange>
  );
}

function EditCar({ trip }: { readonly trip: TripToChange }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const load = useCallback(() => session.call(listVehiclesRoute, {}), [session]);
  const { value: cars, reload } = useLoadedOnFocus(load);
  const [vehicleId, setVehicleId] = useState(trip.vehicleId);
  return (
    <ChangePartScreen
      trip={trip}
      title={t("trip.editCarAction")}
      change={
        vehicleId === null || vehicleId === trip.vehicleId ? null : { kind: "vehicle", vehicleId }
      }
    >
      <Body align="start">{t("trip.editCarHelp")}</Body>
      {cars === undefined ? (
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      ) : !cars.ok ? (
        <>
          <Notice message={errorText(t, cars)} />
          <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        </>
      ) : (
        <CarChoices cars={cars.data.vehicles} vehicleId={vehicleId} onChange={setVehicleId} />
      )}
      <TextLink label={t("vehicle.add")} href="/drive/cars/new" />
    </ChangePartScreen>
  );
}
