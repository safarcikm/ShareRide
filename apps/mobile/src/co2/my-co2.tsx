import type { Co2Totals } from "@shareride/contracts";
import { shownKilograms } from "@shareride/domain";
import { formatCount } from "@shareride/i18n";
import { StyleSheet, Text, View } from "react-native";
import { Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Co2Card } from "./co2-card";

/**
 * My own CO2 saved on My profile (spec 34, 3.8): the group "Your shared
 * rides" with the card of my total, unfolding a line for each role I have
 * of at least 1 kg, then the comparison; "Only you can see this." under
 * it. Under 1 kg in all, or before a ride counts, there is no group.
 */
export function MyCo2({ totals }: { readonly totals: Co2Totals }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  if (shownKilograms(totals.grams) === null) return null;
  const kg = (grams: number) => formatCount(shownKilograms(grams) ?? 0, locale);
  const { asPassenger, asDriver } = totals;
  const lines = [
    asPassenger === null || shownKilograms(asPassenger.grams) === null
      ? null
      : t("co2.asPassenger", { kg: kg(asPassenger.grams), rides: asPassenger.rides }),
    asDriver === null || shownKilograms(asDriver.grams) === null
      ? null
      : t("co2.asDriver", {
          kg: kg(asDriver.grams),
          passengers: asDriver.passengers,
          rides: asDriver.rides,
        }),
    t("co2.compared"),
    t("co2.how"),
  ].filter((line) => line !== null);
  return (
    <View style={styles.group}>
      <Heading>{t("co2.group")}</Heading>
      <Co2Card grams={totals.grams} lines={lines} />
      <Text style={[typography.small, { color: palette.textMuted }]}>{t("co2.onlyYou")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
