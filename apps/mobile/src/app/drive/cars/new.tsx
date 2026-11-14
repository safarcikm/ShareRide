import { BackButton } from "@/components/back-button";
import { Screen } from "@/components/screen";
import { Title } from "@/components/text";
import { backToDrive } from "@/driving/back-to-drive";
import { CarForm } from "@/driving/car-form";
import { useLanguage } from "@/i18n/language";

/** Add a car (spec 3, screen 2). */
export default function AddCarScreen() {
  const { t } = useLanguage();
  return (
    <Screen>
      <BackButton fallback="/drive" />
      <Title>{t("vehicle.add")}</Title>
      <CarForm onSaved={backToDrive} />
    </Screen>
  );
}
