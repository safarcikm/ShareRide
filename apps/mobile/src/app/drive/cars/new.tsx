import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { backTo } from "@/driving/back-to";
import { CarForm } from "@/driving/car-form";
import { useLanguage } from "@/i18n/language";

/** Add a car (spec 3, screen 2), with its title at the left (spec 31, 3.19). */
export default function AddCarScreen() {
  const { t } = useLanguage();
  return (
    <Screen>
      <ScreenHead title={t("vehicle.add")} back="/drive/cars" />
      <CarForm
        onSaved={() => {
          backTo("/drive/cars");
        }}
      />
    </Screen>
  );
}
