import { listVehiclesRoute, removeVehicleRoute, type Vehicle } from "@shareride/contracts";
import { useLocalSearchParams } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { ActionRows } from "@/components/action-rows";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Row } from "@/components/row";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { Body } from "@/components/text";
import { backTo } from "@/driving/back-to";
import { CarForm } from "@/driving/car-form";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Edit a car (spec 3, screen 2), such as to add the number plate, or remove
 * it. The title is at the left, also while the car is read and when it is
 * not there (spec 31, 3.19).
 */
export default function EditCarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const load = useCallback(() => session.call(listVehiclesRoute, {}), [session]);
  const { value: result, reload } = useLoaded(load);
  const car = result?.ok === true ? result.data.vehicles.find((known) => known.id === id) : null;

  return (
    <Screen>
      <ScreenHead title={t("vehicle.editTitle")} back="/drive/cars" />
      {result === undefined ? (
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      ) : !result.ok ? (
        <>
          <Notice message={errorText(t, result)} />
          <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        </>
      ) : car === undefined || car === null ? (
        <Notice message={t("vehicle.notFound")} />
      ) : (
        <>
          <CarForm
            car={car}
            onSaved={() => {
              backTo("/drive/cars");
            }}
          />
          <RemoveCar car={car} />
        </>
      )}
    </Screen>
  );
}

/**
 * Remove, after a confirmation that names the car: a red row, the last
 * thing on the page, as it takes something away (spec 31, R31.3 and
 * decision 17). The car stays on past trips; one on a trip that has not
 * ended cannot be removed.
 */
function RemoveCar({ car }: { readonly car: Vehicle }) {
  const { t } = useLanguage();
  const session = useSession();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const name = `${car.make} ${car.model}`;

  async function remove() {
    setFailure(null);
    setBusy(true);
    const result = await session.call(removeVehicleRoute, { params: { id: car.id } });
    setBusy(false);
    // Already gone counts as removed.
    if (result.ok || result.status === 404) backTo("/drive/cars");
    else if (result.error.code === "vehicle_in_use") setFailure(t("vehicle.inUse"));
    else setFailure(errorText(t, result));
  }

  if (!asking) {
    return (
      <ActionRows>
        <Row
          danger
          icon={Trash2}
          title={t("vehicle.remove")}
          onPress={() => {
            setAsking(true);
          }}
        />
      </ActionRows>
    );
  }
  return (
    <Card>
      <Body align="start">{t("vehicle.removeConfirm", { car: name })}</Body>
      <Notice message={failure} />
      <View style={styles.choices}>
        <Button
          variant="secondary"
          label={t("vehicle.removeNamed", { car: name })}
          busy={busy}
          onPress={() => void remove()}
        />
        <Button
          variant="text"
          label={t("vehicle.keep")}
          onPress={() => {
            setAsking(false);
            setFailure(null);
          }}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({ choices: { gap: spacing.sm } });
