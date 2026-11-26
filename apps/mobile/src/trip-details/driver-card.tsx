import type { Standing, TripDetails } from "@shareride/contracts";
import { Car, ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar, besideAvatar } from "@/components/avatar";
import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { NeedBubble } from "@/components/need-bubble";
import { Tag } from "@/components/tag";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { linkProps } from "@/navigation/link-props";
import { RatingLine, ratingText, reliabilityText } from "@/people/standing";
import { useHover } from "@/theme/hover";
import { controlOutline, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { carText } from "./texts";
import { preferenceNeeds } from "./trip-parts";

/**
 * The driver of a ride in a card of their own (spec 31, 3.7, item 3):
 * their picture, name and rating, or "New driver" before the first; for
 * members signed in, who have `profileId`, the reliability figure too, and
 * the whole line opens the profile, with a chevron at its end. Under a
 * line: the car, with what the passenger learns about the number plate,
 * what the driver likes on a ride, and their note.
 */
export function DriverCard({
  driver,
  car,
  carNote,
  preferences,
  note = "",
}: {
  readonly driver: Standing & {
    readonly firstName: string;
    readonly colour: number;
    /** A link to their profile, for members signed in (spec 1, 3.5). */
    readonly profileId: string | null;
    /** A link to their photo, or null (spec 1, 3.5). */
    readonly photo: string | null;
  };
  readonly car: TripDetails["car"];
  /** What the passenger learns about the number plate, if anything. */
  readonly carNote?: string;
  readonly preferences?: TripDetails["preferences"];
  readonly note?: string;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const needs = preferenceNeeds(t, preferences);
  const rated = driver.rating.count > 0;
  const { profileId } = driver;
  const figure = profileId === null ? null : reliabilityText(t, driver.reliabilityPercent);
  const person = (
    <>
      <Avatar firstName={driver.firstName} colour={driver.colour} photo={driver.photo} />
      <View style={[besideAvatar.text, styles.standing]}>
        <Text style={[typography.heading, { color: palette.text }]}>{driver.firstName}</Text>
        {rated ? (
          <RatingLine rating={driver.rating} />
        ) : (
          <View style={styles.tag}>
            <Tag kind="warning" label={t("results.newDriver")} />
          </View>
        )}
        {/* The figure, like the profile, is for members signed in (spec 1, 3.5). */}
        {figure === null ? null : (
          <Text style={[typography.small, { color: palette.textMuted }]}>{figure}</Text>
        )}
      </View>
    </>
  );
  return (
    <Card>
      <View testID="driver-card" style={styles.card}>
        {profileId === null ? (
          <View style={styles.person}>{person}</View>
        ) : (
          <ProfileLink
            profileId={profileId}
            // A link's name takes the place of what it holds, so it says all of it.
            label={[
              t("people.openOf", { name: driver.firstName }),
              rated ? ratingText(t, locale, driver.rating) : t("results.newDriver"),
              figure,
            ]
              .filter((part) => part !== null)
              .join(", ")}
          >
            {person}
          </ProfileLink>
        )}
        {car === null && needs.length === 0 && note === "" ? null : (
          <View
            testID="driver-card-line"
            style={[styles.line, { backgroundColor: palette.border }]}
          />
        )}
        {car === null ? null : (
          <View style={styles.car}>
            <View style={[styles.carIcon, { backgroundColor: palette.background }]}>
              <Icon icon={Car} color={palette.text} />
            </View>
            <View style={besideAvatar.text}>
              <Text style={[typography.bodyStrong, { color: palette.text }]}>
                {carText(t, car)}
              </Text>
              {carNote === undefined ? null : (
                <Text style={[typography.small, { color: palette.textMuted }]}>{carNote}</Text>
              )}
            </View>
          </View>
        )}
        {needs.length === 0 ? null : (
          <View style={styles.needs}>
            {needs.map((need) => (
              <NeedBubble
                key={need.label}
                icon={need.icon}
                colour={need.colour}
                label={need.label}
              />
            ))}
          </View>
        )}
        {note === "" ? null : (
          <View>
            <Text style={[typography.label, { color: palette.text }]}>{t("trip.note")}</Text>
            <Body>{note}</Body>
          </View>
        )}
      </View>
    </Card>
  );
}

/** The driver's line as a link to their profile, tinted under the pointer and while pressed. */
function ProfileLink({
  profileId,
  label,
  children,
}: {
  readonly profileId: string;
  readonly label: string;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  const [hovered, hover] = useHover();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      {...linkProps({ pathname: "/people/[profileId]", params: { profileId } })}
      {...hover}
      style={({ pressed }) => [
        styles.person,
        styles.link,
        pressed || hovered ? { backgroundColor: palette.primarySoft } : null,
      ]}
    >
      {children}
      <Icon testID="driver-card-chevron" icon={ChevronRight} color={palette.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.ms },
  person: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  // The tint reaches a little past the picture and the chevron, as a row's does in a card.
  link: {
    borderRadius: radii.control,
    padding: spacing.sm,
    margin: -spacing.sm,
  },
  standing: { gap: spacing.xs, alignItems: "flex-start" },
  tag: { flexDirection: "row" },
  line: { height: controlOutline / 2 },
  car: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  carIcon: {
    width: sizes.rowIcon,
    height: sizes.rowIcon,
    borderRadius: radii.tag,
    alignItems: "center",
    justifyContent: "center",
  },
  needs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
