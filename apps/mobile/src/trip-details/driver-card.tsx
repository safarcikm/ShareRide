import type { Standing, TripDetails } from "@shareride/contracts";
import { Car, ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
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

/** On the web a label counts only on an element with a role. */
const imageRole: object = Platform.OS === "web" ? { role: "img" } : {};

/**
 * The driver of a ride in a card of their own (spec 31, 3.7, item 3):
 * their picture, name and rating, or "New driver" before the first; for
 * members signed in, who have `profileId`, the reliability figure too, and
 * the whole line opens the profile, with a chevron at its end. The picture
 * stands with the name, at the top of the lines about them (3.18). Under a
 * line: the car, with what the passenger learns about the number plate,
 * what the driver likes on a ride, and their note.
 *
 * On a booked seat (3.8, item 4, and 3.9, item 2) an `action`, Message,
 * stands at the right of the driver in the chevron's place, and goes under
 * them where the two have no room; the number plate, once it shows, is a
 * `plate` at the right of the car. Someone who has left shows no
 * `standing`.
 */
export function DriverCard({
  driver,
  car,
  carNote,
  plate = null,
  preferences,
  note = "",
  action,
  standing = true,
  fill = false,
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
  readonly carNote?: string | undefined;
  /** The number plate, once the passenger may see it: a tag beside the car. */
  readonly plate?: string | null;
  readonly preferences?: TripDetails["preferences"];
  readonly note?: string;
  /** At the right of the driver, such as Message; then their line has no chevron. */
  readonly action?: ReactNode;
  /** Whether their rating and reliability show: not for someone who has left. */
  readonly standing?: boolean;
  /** Beside another card in a grid: as tall as its row. */
  readonly fill?: boolean;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const needs = preferenceNeeds(t, preferences);
  const rated = driver.rating.count > 0;
  const { profileId } = driver;
  const figure =
    profileId === null || !standing ? null : reliabilityText(t, driver.reliabilityPercent);
  const acts = action !== undefined && action !== null;
  const person = (
    <>
      <Avatar firstName={driver.firstName} colour={driver.colour} photo={driver.photo} />
      <View style={[besideAvatar.text, styles.standing]}>
        <Text style={[typography.heading, { color: palette.text }]}>{driver.firstName}</Text>
        {!standing ? null : rated ? (
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
  const who =
    profileId === null ? (
      <View style={besideAvatar.row}>{person}</View>
    ) : (
      <ProfileLink
        profileId={profileId}
        chevron={!acts}
        // A link's name takes the place of what it holds, so it says all of it.
        label={[
          t("people.openOf", { name: driver.firstName }),
          !standing ? null : rated ? ratingText(t, locale, driver.rating) : t("results.newDriver"),
          figure,
        ]
          .filter((part) => part !== null)
          .join(", ")}
      >
        {person}
      </ProfileLink>
    );
  return (
    <Card fill={fill}>
      <View testID="driver-card" style={styles.card}>
        {acts ? (
          <View style={styles.withAction}>
            <View style={styles.who}>{who}</View>
            <View testID="driver-card-action">{action}</View>
          </View>
        ) : (
          who
        )}
        {car === null && needs.length === 0 && note === "" ? null : (
          <View style={[styles.line, { backgroundColor: palette.border }]} />
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
            {plate === null ? null : (
              // As it stands on the car, with what it is for a screen reader.
              <View
                testID="driver-card-plate"
                accessible
                accessibilityRole="image"
                accessibilityLabel={t("booking.plate", { plate })}
                {...imageRole}
                style={[styles.plate, { borderColor: palette.control }]}
              >
                <Text style={[typography.label, { color: palette.text }]}>{plate}</Text>
              </View>
            )}
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
  chevron,
  children,
}: {
  readonly profileId: string;
  readonly label: string;
  /** At its end, unless a button stands there. */
  readonly chevron: boolean;
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
        besideAvatar.row,
        styles.link,
        pressed || hovered ? { backgroundColor: palette.primarySoft } : null,
      ]}
    >
      {children}
      {/* At the middle of the line, whatever its height; the picture stays at its top. */}
      {chevron ? (
        <View style={styles.chevron}>
          <Icon icon={ChevronRight} color={palette.textMuted} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.ms },
  // The tint reaches a little past the picture and the chevron, as a row's does in a card.
  link: {
    borderRadius: radii.control,
    padding: spacing.sm,
    margin: -spacing.sm,
  },
  chevron: { alignSelf: "center" },
  // The driver and the button beside them; the button goes under the
  // driver where the card has no room for both.
  withAction: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: spacing.ms,
    rowGap: spacing.sm,
  },
  who: { flexGrow: 1, flexShrink: 1, flexBasis: sizes.wordsBeside, minWidth: 0 },
  plate: {
    borderWidth: controlOutline,
    borderRadius: radii.tag,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
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
