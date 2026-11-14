import { listVehiclesRoute, removeVehicleRoute, type Vehicle } from "@shareride/contracts";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { backToDrive } from "@/driving/back-to-drive";
import { CarForm } from "@/driving/car-form";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** Edit a car (spec 3, screen 2), such as to add the number plate, or remove it. */
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
      <BackButton fallback="/drive" />
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
          <Title>{t("vehicle.editTitle")}</Title>
          <CarForm car={car} onSaved={backToDrive} />
          <RemoveCar car={car} />
        </>
      )}
    </Screen>
  );
}

/**
 * Remove, after a confirmation that names the car. It stays on past trips;
 * a car on a future trip cannot be removed (that check comes with trips).
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
    if (result.ok || result.status === 404) backToDrive();
    else setFailure(errorText(t, result));
  }

  if (!asking) {
    return (
      <Button
        variant="text"
        label={t("vehicle.remove")}
        onPress={() => {
          setAsking(true);
        }}
      />
    );
  }
  return (
    <Card>
      <Body>{t("vehicle.removeConfirm", { car: name })}</Body>
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
