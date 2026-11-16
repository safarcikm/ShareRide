import type { TripDetails } from "@shareride/contracts";
import { formatClock } from "@shareride/i18n";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/button";
import { RadioCard } from "@/components/radio-card";
import { TakesFocus } from "@/components/takes-focus";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { partStopTime } from "./trip-parts";

type Stop = TripDetails["stops"][number];

/**
 * Where the passenger gets in or out, with Change (spec 16, 3.7, item 1):
 * "Get in", the time and the stop. Change opens the stops that can take its
 * place, as choices, and closes again on a choice or a second press; focus
 * then goes back to Change. With no other stop to choose, there is no Change.
 */
export function StopChoice({
  getIn,
  stop,
  choices,
  onChoose,
}: {
  readonly getIn: boolean;
  readonly stop: Stop;
  /** The stops that can take this one's place, this one among them, in route order. */
  readonly choices: readonly Stop[];
  readonly onChoose: (position: number) => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  // How many choices closed the list: each one gives focus back to Change,
  // which the chosen card held before it went.
  const [chosen, setChosen] = useState(0);
  const name = (each: Stop) => each.meetingPoint.name[locale];
  return (
    <View testID="stop-choice" style={styles.choice}>
      <View style={styles.row}>
        <View style={styles.grow}>
          <Text style={[typography.small, { color: palette.textMuted }]}>
            {getIn ? t("trip.getIn") : t("trip.getOut")}
          </Text>
          <View style={styles.stop}>
            <Text style={[typography.figure, partStopTime, { color: palette.text }]}>
              {formatClock(new Date(stop.plannedAt))}
            </Text>
            <Text style={[typography.bodyStrong, styles.grow, { color: palette.text }]}>
              {name(stop)}
            </Text>
          </View>
        </View>
        {choices.length > 1 ? (
          <TakesFocus key={chosen} when={chosen > 0}>
            <Button
              variant="text"
              label={t("trip.change")}
              accessibilityLabel={getIn ? t("trip.changeGetIn") : t("trip.changeGetOut")}
              expanded={open}
              onPress={() => {
                setOpen((was) => !was);
              }}
            />
          </TakesFocus>
        ) : null}
      </View>
      {open && choices.length > 1 ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={getIn ? t("trip.getInChoices") : t("trip.getOutChoices")}
          style={styles.choices}
        >
          {choices.map((each) => (
            <RadioCard
              key={each.position}
              title={t("trip.timeAndStop", {
                time: formatClock(new Date(each.plannedAt)),
                name: name(each),
              })}
              selected={each.position === stop.position}
              onSelect={() => {
                setOpen(false);
                setChosen((count) => count + 1);
                if (each.position !== stop.position) onChoose(each.position);
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  choice: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stop: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  grow: { flex: 1 },
  choices: { gap: spacing.sm },
});
