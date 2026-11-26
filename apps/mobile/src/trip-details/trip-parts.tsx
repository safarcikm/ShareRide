import type { TripDetails } from "@shareride/contracts";
import { formatClock, type Translate } from "@shareride/i18n";
import {
  Baby,
  Cigarette,
  CigaretteOff,
  Luggage,
  MessageCircle,
  PawPrint,
  type LucideIcon,
} from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Tag } from "@/components/tag";
import { useLanguage } from "@/i18n/language";
import { people, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { childSeatNeedKey, needKeys } from "./texts";

// Parts of a trip shown on more than one screen: a stop of a passenger's
// part, and what the driver likes on a ride.

type Stop = Pick<TripDetails["stops"][number], "meetingPoint" | "plannedAt">;

/** A stop's time keeps one width, so the names after it line up. */
const partStopTime = { minWidth: spacing.xxl + spacing.md };

/** A stop of the part: its time, name and "Get in" or "Get out". */
export function PartStop({ stop, getIn }: { readonly stop: Stop; readonly getIn: boolean }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  return (
    <View style={styles.partStop}>
      <Text style={[typography.figure, partStopTime, { color: palette.text }]}>
        {formatClock(new Date(stop.plannedAt))}
      </Text>
      <Text style={[typography.bodyStrong, styles.grow, { color: palette.text }]}>
        {stop.meetingPoint.name[locale]}
      </Text>
      <Tag kind="positive" label={getIn ? t("trip.getIn") : t("trip.getOut")} />
    </View>
  );
}

/** What a driver likes on a ride, as a bubble: an icon on a people colour, and a few words. */
export interface PreferenceBubble {
  readonly icon: LucideIcon;
  readonly colour: string;
  readonly label: string;
}

/**
 * A ride's preferences as bubbles, in the order they show: chat, luggage,
 * pets, smoking and the child seat.
 */
export function preferenceNeeds(
  t: Translate,
  preferences: TripDetails["preferences"] | undefined,
): readonly PreferenceBubble[] {
  if (preferences === undefined) return [];
  return [
    { icon: MessageCircle, colour: people.glacier, label: t(needKeys.chat[preferences.chat]) },
    { icon: Luggage, colour: people.sun, label: t(needKeys.luggage[preferences.luggage]) },
    { icon: PawPrint, colour: people.lupine, label: t(needKeys.pets[preferences.pets]) },
    {
      icon: preferences.smoking === "no" ? CigaretteOff : Cigarette,
      colour: people.crowberry,
      label: t(needKeys.smoking[preferences.smoking]),
    },
    { icon: Baby, colour: people.mossLight, label: t(childSeatNeedKey(preferences.childSeat)) },
  ];
}

const styles = StyleSheet.create({
  partStop: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  grow: { flex: 1 },
});
