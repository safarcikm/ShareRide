// The price of a trip as the driver sets it (spec 3, 3.6; ADR 0012), in
// posting's price step and on Edit trip (spec 6, 3.2).
import { suggestedPriceLevel, type Money } from "@shareride/domain";
import { formatMoney } from "@shareride/i18n";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/card";
import { PriceLevel } from "@/components/price-level";
import { Tag } from "@/components/tag";
import { Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { controlOutline, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { levelText } from "./texts";

/**
 * The whole-route price, the level control and each stretch's price. The
 * control shows `level` at once, so quick taps each count while prices for
 * it may still be on their way; the prices are for `pricedLevel`.
 */
export function PriceCard({
  names,
  prices,
  whole,
  pricedLevel,
  level,
  highest,
  step,
  onLevel,
}: {
  /** The stops' names in route order. */
  readonly names: readonly string[];
  /** Each stretch's price per seat. */
  readonly prices: readonly Money[];
  readonly whole: Money;
  readonly pricedLevel: number;
  readonly level: number;
  readonly highest: number;
  readonly step: number;
  readonly onLevel: (level: number) => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const wholeText = formatMoney(whole, locale);
  return (
    <>
      <Card>
        <View style={styles.price}>
          <Text style={[typography.small, styles.centre, { color: palette.textMuted }]}>
            {t("trip.price.wholeRoute")}
          </Text>
          <Text
            testID="whole-route-price"
            style={[typography.display, styles.centre, { color: palette.text }]}
          >
            {wholeText}
          </Text>
          {pricedLevel === suggestedPriceLevel ? (
            <Tag kind="positive" label={t("trip.price.suggestedTag")} />
          ) : null}
        </View>
        <PriceLevel
          level={level}
          highest={highest}
          step={step}
          suggested={suggestedPriceLevel}
          onChange={onLevel}
          valueText={t("trip.price.levelValue", {
            level: levelText(t, pricedLevel),
            price: wholeText,
          })}
        />
      </Card>
      <Card>
        <Heading>{t("trip.price.stretches")}</Heading>
        {prices.map((segmentPrice, index) => {
          const from = names[index] ?? "";
          const to = names[index + 1] ?? "";
          const price = formatMoney(segmentPrice, locale);
          return (
            <View
              key={`${String(index)}-${from}-${to}`}
              accessible
              accessibilityLabel={`${t("trip.stretchSpoken", { from, to })}, ${price}`}
              style={[
                styles.stretch,
                index > 0 && { borderTopWidth: controlOutline, borderTopColor: palette.border },
              ]}
            >
              <Text style={[typography.body, styles.stretchName, { color: palette.text }]}>
                {t("trip.stretch", { from, to })}
              </Text>
              <Text style={[typography.bodyStrong, { color: palette.text }]}>{price}</Text>
            </View>
          );
        })}
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {t("trip.price.perStretch")}
        </Text>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  price: { alignItems: "center", gap: spacing.sm },
  centre: { textAlign: "center" },
  stretch: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  stretchName: { flex: 1 },
});
