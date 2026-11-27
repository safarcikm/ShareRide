import { listVehiclesRoute } from "@shareride/contracts";
import { router } from "expo-router";
import { useCallback } from "react";
import { Car, Plus } from "lucide-react-native";
import { ActivityIndicator } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { ActionRows } from "@/components/action-rows";
import { Button } from "@/components/button";
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
 * title is at the left, and the cars are a card of rows, each with a
 * picture, with "Add a car" as its last row; while there is no car, "Add a
 * car" is the page's main button, in the bar (spec 31, 3.19 and R31.1).
 */
export default function MyCarsScreen() {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const load = useCallback(() => session.call(listVehiclesRoute, {}), [session]);
  const { value, reload } = useLoadedOnFocus(load);
  const add = () => {
    router.push("/drive/cars/new");
  };
  const none = value?.ok === true && value.data.vehicles.length === 0;
  return (
    <Screen footer={none ? <Button main label={t("vehicle.add")} onPress={add} /> : undefined}>
      <ScreenHead title={t("profile.myCars")} back="/profile" />
      {value === undefined ? (
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      ) : !value.ok ? (
        <>
          <Notice message={errorText(t, value)} />
          <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        </>
      ) : none ? (
        <Body align="start">{t("profile.noCars")}</Body>
      ) : (
        <ActionRows>
          {value.data.vehicles.map((car) => (
            <Row
              key={car.id}
              icon={Car}
              title={carSummary(t, locale, car)}
              value={car.registration ?? t("vehicle.noPlate")}
              onPress={() => {
                router.push({ pathname: "/drive/cars/[id]", params: { id: car.id } });
              }}
            />
          ))}
          <Row icon={Plus} title={t("vehicle.add")} onPress={add} />
        </ActionRows>
      )}
    </Screen>
  );
}
