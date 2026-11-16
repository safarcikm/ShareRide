import type { TripDetails } from "@shareride/contracts";
import { formatClock } from "@shareride/i18n";
import {
  Baby,
  Car,
  Cigarette,
  CigaretteOff,
  Luggage,
  MessageCircle,
  PawPrint,
} from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Avatar, avatarSize } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { NeedBubble } from "@/components/need-bubble";
import { Tag } from "@/components/tag";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { people, radii, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { carText, childSeatNeedKey, needKeys } from "./texts";

// Parts of a trip shown on trip details, the booking screen and a booking:
// a stop of the passenger's part, and the driver with their car.

type Stop = Pick<TripDetails["stops"][number], "meetingPoint" | "plannedAt">;

/** A stop's time keeps one width, so the names after it line up. */
export const partStopTime = { minWidth: spacing.xxl + spacing.md };

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

/**
 * The driver, their car with a line under it (when the number plate shows),
 * and, on the trip's own pages, their preferences and note. The booking
 * screen puts luggage first (spec 5, 3.1).
 */
export function DriverAndCar({
  driver,
  car,
  carNote,
  preferences,
  note = "",
  luggageFirst = false,
}: {
  readonly driver: TripDetails["driver"];
  readonly car: TripDetails["car"];
  /** What the passenger learns about the number plate, if anything. */
  readonly carNote?: string;
  readonly preferences?: TripDetails["preferences"];
  readonly note?: string;
  readonly luggageFirst?: boolean;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const listed =
    preferences === undefined
      ? []
      : [
          {
            icon: MessageCircle,
            colour: people.glacier,
            label: t(needKeys.chat[preferences.chat]),
          },
          { icon: Luggage, colour: people.sun, label: t(needKeys.luggage[preferences.luggage]) },
          { icon: PawPrint, colour: people.lupine, label: t(needKeys.pets[preferences.pets]) },
          {
            icon: preferences.smoking === "no" ? CigaretteOff : Cigarette,
            colour: people.crowberry,
            label: t(needKeys.smoking[preferences.smoking]),
          },
          {
            icon: Baby,
            colour: people.mossLight,
            label: t(childSeatNeedKey(preferences.childSeat)),
          },
        ];
  const needs = luggageFirst
    ? [
        ...listed.filter((need) => need.icon === Luggage),
        ...listed.filter((need) => need.icon !== Luggage),
      ]
    : listed;
  return (
    <>
      <View style={styles.person}>
        <Avatar firstName={driver.firstName} colour={driver.colour} />
        <View style={styles.grow}>
          <Text style={[typography.bodyStrong, { color: palette.text }]}>{driver.firstName}</Text>
          <View style={styles.row}>
            <Tag kind="warning" label={t("results.newDriver")} />
          </View>
        </View>
      </View>
      {car === null ? null : (
        <View style={styles.person}>
          <View style={[styles.avatar, { backgroundColor: palette.background }]}>
            <Icon icon={Car} color={palette.text} />
          </View>
          <View style={styles.grow}>
            <Text style={[typography.bodyStrong, { color: palette.text }]}>{carText(t, car)}</Text>
            {carNote === undefined ? null : (
              <Text style={[typography.small, { color: palette.textMuted }]}>{carNote}</Text>
            )}
          </View>
        </View>
      )}
      {needs.length === 0 ? null : (
        <View style={styles.needs}>
          {needs.map((need) => (
            <NeedBubble key={need.label} icon={need.icon} colour={need.colour} label={need.label} />
          ))}
        </View>
      )}
      {note === "" ? null : (
        <View>
          <Text style={[typography.label, { color: palette.text }]}>{t("trip.note")}</Text>
          <Body>{note}</Body>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  partStop: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
  person: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  avatar: {
    width: avatarSize,
    height: avatarSize,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  needs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
