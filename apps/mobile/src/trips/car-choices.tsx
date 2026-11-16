// The driver's cars to choose from, as posting's seats step and Edit trip
// both offer them (spec 3, 3.7; spec 6, 3.2).
import type { Vehicle } from "@shareride/contracts";
import { StyleSheet, View } from "react-native";
import { RadioCard } from "@/components/radio-card";
import { carSummary } from "@/driving/texts";
import { useLanguage } from "@/i18n/language";
import { spacing } from "@/theme/tokens";

/** Each car with its number plate, the chosen one selected. */
export function CarChoices({
  cars,
  vehicleId,
  onChange,
}: {
  readonly cars: readonly Vehicle[];
  readonly vehicleId: string | null;
  readonly onChange: (vehicleId: string) => void;
}) {
  const { locale, t } = useLanguage();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t("trip.car.title")}
      style={styles.group}
    >
      {cars.map((car) => (
        <RadioCard
          key={car.id}
          title={carSummary(t, locale, car)}
          help={car.registration ?? t("vehicle.noPlate")}
          selected={vehicleId === car.id}
          onSelect={() => {
            onChange(car.id);
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
