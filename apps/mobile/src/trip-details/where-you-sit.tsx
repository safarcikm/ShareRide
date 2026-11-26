import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/card";
import { Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { SeatView } from "./seat-view";

/**
 * Where the passenger sits, in a card of its own (spec 31, 3.7, item 4):
 * the car from above with the seats of their part, and beside it one line
 * saying how many are free and that seats are not numbered, in the place
 * of a legend. With no room for the two beside each other, as with large
 * text, the line goes under the car.
 */
export function WhereYouSit({
  offered,
  free,
  yours,
  driverColour,
}: {
  readonly offered: number;
  /** Seats free on the part, yours included. */
  readonly free: number;
  readonly yours: number;
  readonly driverColour: number;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <Card>
      <View testID="where-you-sit" style={styles.card}>
        <View style={[styles.part, styles.car]}>
          <SeatView
            legend={false}
            offered={offered}
            free={free}
            yours={yours}
            driverColour={driverColour}
          />
        </View>
        <View style={[styles.part, styles.words]}>
          <Heading>{t("trip.whereYouSit")}</Heading>
          <Text style={[typography.small, { color: palette.textMuted }]}>
            {t("trip.whereYouSitLine", { free, offered })}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: spacing.md,
    rowGap: spacing.ms,
  },
  part: { flexGrow: 1, flexShrink: 1, flexBasis: sizes.wordsBeside, minWidth: 0 },
  // The car stays the size it has on a phone, so a wide card gives its room to the words.
  car: { maxWidth: sizes.carBeside },
  words: { gap: spacing.xs },
});
