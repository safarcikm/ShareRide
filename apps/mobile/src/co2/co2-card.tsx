import { shownKilograms } from "@shareride/domain";
import { formatCount, type Locale, type Translate } from "@shareride/i18n";
import { Leaf } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/card";
import { Row } from "@/components/row";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * The CO2 a shared ride saves (spec 34, 3.4): one folded row with a leaf,
 * "CO₂ saved" and "About 58 kg, estimated". Unfolded, the sentences that
 * say what it is for this ride, always compared with driving alone, and
 * "How we estimate it", which opens About's method. Under 1 kg, at the
 * setting 0 or without a figure, nothing shows (R34.7). It goes in a
 * screen's main column, never in a laptop's side column.
 */
export function Co2Card({
  grams,
  lines,
}: {
  readonly grams: number | null;
  /** The sentences shown unfolded, above the link. */
  readonly lines: readonly string[];
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const kilograms = shownKilograms(grams);
  if (kilograms === null) return null;
  const kg = formatCount(kilograms, locale);
  return (
    <Card>
      <View testID="co2-card">
        <Row
          icon={Leaf}
          title={t("co2.title")}
          value={t("co2.value", { kg })}
          accessibilityLabel={t("co2.spoken", { kg })}
          expanded={open}
          onToggle={() => {
            setOpen((was) => !was);
          }}
        >
          <View style={styles.under}>
            {lines.map((line) => (
              <Text key={line} style={[typography.body, { color: palette.text }]}>
                {line}
              </Text>
            ))}
            <TextLink align="start" label={t("co2.link")} href="/about#co2" />
          </View>
        </Row>
      </View>
    </Card>
  );
}

/** Whole kilometres of a part, as the card's sentences say them. */
function kilometres(distanceM: number, locale: Locale): string {
  return formatCount(Math.round(distanceM / 1000), locale);
}

/** The kilograms the card shows, in its sentences too; 0 where it shows none. */
function kilograms(grams: number | null, locale: Locale): string {
  return formatCount(shownKilograms(grams) ?? 0, locale);
}

/** A passenger's part, on a ride's details and a booked seat (3.5, 3.6). */
export function partCo2Lines(
  t: Translate,
  locale: Locale,
  figure: { readonly distanceM: number; readonly grams: number | null },
): string[] {
  return [
    t("co2.part", {
      km: kilometres(figure.distanceM, locale),
      kg: kilograms(figure.grams, locale),
    }),
    t("co2.how"),
  ];
}

/** The driver's ride: its passengers' parts added (3.7). */
export function driverCo2Lines(
  t: Translate,
  locale: Locale,
  figure: { readonly distanceM: number; readonly grams: number },
): string[] {
  return [
    t("co2.driver", {
      km: kilometres(figure.distanceM, locale),
      kg: kilograms(figure.grams, locale),
    }),
    t("co2.how"),
  ];
}

const styles = StyleSheet.create({
  under: { gap: spacing.sm },
});
