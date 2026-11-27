import { listVehiclesRoute } from "@shareride/contracts";
import { router } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Row } from "@/components/row";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { Body } from "@/components/text";
import { carSummary } from "@/driving/texts";
import { useLanguage } from "@/i18n/language";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { usePalette } from "@/theme/use-palette";

/**
 * My cars (spec 16, 3.4 item 2): each car with its number plate, opening
 * to edit it, and Add a car. Loads again on coming back from either. The
 * title is at the left (spec 31, 3.19).
 */
export default function MyCarsScreen() {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const load = useCallback(() => session.call(listVehiclesRoute, {}), [session]);
  const { value, reload } = useLoadedOnFocus(load);
  return (
    <Screen>
      <ScreenHead title={t("profile.myCars")} back="/profile" />
      {value === undefined ? (
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      ) : !value.ok ? (
        <>
          <Notice message={errorText(t, value)} />
          <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        </>
      ) : value.data.vehicles.length === 0 ? (
        <Body align="start">{t("profile.noCars")}</Body>
      ) : (
        <Card>
          {value.data.vehicles.map((car) => (
            <Row
              key={car.id}
              title={carSummary(t, locale, car)}
              value={car.registration ?? t("vehicle.noPlate")}
              onPress={() => {
                router.push({ pathname: "/drive/cars/[id]", params: { id: car.id } });
              }}
            />
          ))}
        </Card>
      )}
      <Button
        variant={value?.ok === true && value.data.vehicles.length === 0 ? "primary" : "secondary"}
        label={t("vehicle.add")}
        onPress={() => {
          router.push("/drive/cars/new");
        }}
      />
    </Screen>
  );
}
