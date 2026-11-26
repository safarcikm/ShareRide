import type { Standing, TripDetails } from "@shareride/contracts";
import { formatClock, type Translate } from "@shareride/i18n";
import {
  Baby,
  Car,
  Cigarette,
  CigaretteOff,
  Luggage,
  MessageCircle,
  PawPrint,
  type LucideIcon,
} from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Avatar, avatarSize, besideAvatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { NeedBubble } from "@/components/need-bubble";
import { Tag } from "@/components/tag";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { StandingLines } from "@/people/standing";
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

/** What a driver likes on a ride, as bubbles: an icon on a people colour, and a few words. */
export interface Need {
  readonly icon: LucideIcon;
  readonly colour: string;
  readonly label: string;
}

/**
 * A ride's preferences as needs, in the order they show: chat, luggage,
 * pets, smoking and the child seat. The booking screen puts luggage first
 * (spec 5, 3.1).
 */
export function preferenceNeeds(
  t: Translate,
  preferences: TripDetails["preferences"] | undefined,
  luggageFirst = false,
): readonly Need[] {
  if (preferences === undefined) return [];
  const luggage: Need = {
    icon: Luggage,
    colour: people.sun,
    label: t(needKeys.luggage[preferences.luggage]),
  };
  const others: readonly Need[] = [
    { icon: MessageCircle, colour: people.glacier, label: t(needKeys.chat[preferences.chat]) },
    { icon: PawPrint, colour: people.lupine, label: t(needKeys.pets[preferences.pets]) },
    {
      icon: preferences.smoking === "no" ? CigaretteOff : Cigarette,
      colour: people.crowberry,
      label: t(needKeys.smoking[preferences.smoking]),
    },
    { icon: Baby, colour: people.mossLight, label: t(childSeatNeedKey(preferences.childSeat)) },
  ];
  const [chat, ...rest] = others;
  return luggageFirst || chat === undefined ? [luggage, ...others] : [chat, luggage, ...rest];
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
  readonly driver: {
    readonly firstName: string;
    readonly colour: number;
    /** A link to their profile, for members signed in (spec 1, 3.5). */
    readonly profileId: string | null;
    /** Their rating and figure; null for someone nobody sees any more. */
    readonly standing: Standing | null;
    /** A link to their photo, or null (spec 1, 3.5). */
    readonly photo: string | null;
  };
  readonly car: TripDetails["car"];
  /** What the passenger learns about the number plate, if anything. */
  readonly carNote?: string;
  readonly preferences?: TripDetails["preferences"];
  readonly note?: string;
  readonly luggageFirst?: boolean;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const needs = preferenceNeeds(t, preferences, luggageFirst);
  return (
    <>
      <View style={besideAvatar.row}>
        <Avatar firstName={driver.firstName} colour={driver.colour} photo={driver.photo} />
        <View style={besideAvatar.text}>
          <Text style={[typography.bodyStrong, { color: palette.text }]}>{driver.firstName}</Text>
          {driver.standing === null ? null : (
            <StandingLines
              standing={driver.standing}
              profileId={driver.profileId}
              name={driver.firstName}
              newLabel={t("results.newDriver")}
            />
          )}
        </View>
      </View>
      {car === null ? null : (
        <View style={besideAvatar.row}>
          <View style={[styles.avatar, { backgroundColor: palette.background }]}>
            <Icon icon={Car} color={palette.text} />
          </View>
          <View style={besideAvatar.text}>
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
  grow: { flex: 1 },
  avatar: {
    width: avatarSize,
    height: avatarSize,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  needs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
