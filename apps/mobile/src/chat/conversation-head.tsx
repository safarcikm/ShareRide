import type { Conversation } from "@shareride/contracts";
import { capitalised, carText, formatClock, formatShortDay } from "@shareride/i18n";
import { router } from "expo-router";
import { Ban, ChevronRight, EllipsisVertical, Flag, Ticket } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ActionRows } from "@/components/action-rows";
import { Avatar, besideAvatar } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { Icon } from "@/components/icon";
import { IconButton } from "@/components/icon-button";
import { Row } from "@/components/row";
import { sectionLevel } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { dayOf, isoDay } from "@/lib/days";
import { linkProps, type AppPath } from "@/navigation/link-props";
import { firstNameOf } from "@/people/texts";
import { useHover } from "@/theme/hover";
import { iconSizes, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { dayAtTime } from "@/trips/texts";
import { otherPerson } from "./texts";

/**
 * The top of a conversation (spec 31, 3.13, item 1), which stays while the
 * messages scroll: Back, the other person's picture, their name with
 * "Driver, White Toyota Yaris" or "Passenger" under it, and a menu button.
 * The menu holds Report and Block, each two presses away and neither the
 * first thing seen; both ask first on their own screens (spec 9, 3.1 and
 * 3.2). Under them the ride is one line that opens the passenger's booking
 * or the driver's ride.
 *
 * The name is the screen's title; beside my conversations on a wide screen
 * it is the title of a `part`, an h2 on the web (spec 18, 3.11).
 *
 * `onRest` hears how tall it is with its menu closed, each time that
 * changes: the screen lets a top that is too tall for the window scroll
 * with the conversation, and the menu, open for a moment, is not counted.
 */
export function ConversationHead({
  conversation,
  part,
  onRest,
}: {
  readonly conversation: Conversation;
  readonly part: boolean;
  readonly onRest?: (height: number) => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const { booking } = conversation;
  const other = otherPerson(booking);
  const name = firstNameOf(t, other);
  const [menu, setMenu] = useState(false);
  const who =
    booking.viewer === "driver"
      ? t("chat.passenger")
      : booking.car === null
        ? t("chat.driver")
        : t("chat.driverWithCar", { car: carText(t, booking.car) });
  return (
    <View
      testID="conversation-head"
      style={styles.head}
      onLayout={(event) => {
        if (!menu) onRest?.(event.nativeEvent.layout.height);
      }}
    >
      <View style={styles.top}>
        <BackButton quiet fallback="/messages" />
        <Avatar firstName={name} colour={other.colour} photo={other.photo} />
        <View style={besideAvatar.text}>
          <Text
            accessibilityRole="header"
            {...(part ? sectionLevel : {})}
            style={[typography.heading, { color: palette.text }]}
          >
            {name}
          </Text>
          <Text style={[typography.small, { color: palette.textMuted }]}>{who}</Text>
        </View>
        <IconButton
          quiet
          icon={EllipsisVertical}
          label={t("chat.more")}
          expanded={menu}
          onPress={() => {
            setMenu((open) => !open);
          }}
        />
      </View>
      {menu ? (
        <ActionRows>
          <Row
            icon={Flag}
            title={t("report.person", { name })}
            onPress={() => {
              // Closed again on coming back. No name in the address: the
              // report screen reads it from the booking.
              setMenu(false);
              router.push({ pathname: "/report", params: { kind: "user", id: booking.id } });
            }}
          />
          {conversation.blockedByMe ? null : (
            <Row
              danger
              icon={Ban}
              title={t("block.action", { name })}
              onPress={() => {
                setMenu(false);
                router.push({ pathname: "/bookings/[id]/block", params: { id: booking.id } });
              }}
            />
          )}
        </ActionRows>
      ) : null}
      <RideLine conversation={conversation} />
    </View>
  );
}

/**
 * The ride a conversation is about, as one line: "Fri 27 Nov, 18:30" and
 * the part of the route the booking is for. A link: to the booking for its
 * passenger, and to the ride for its driver, who has the passenger there.
 */
function RideLine({ conversation }: { readonly conversation: Conversation }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const [hovered, hover] = useHover();
  const { booking } = conversation;
  const leaves = new Date(booking.board.plannedAt);
  const names = {
    from: booking.board.meetingPoint.name[locale],
    to: booking.alight.meetingPoint.name[locale],
  };
  const when = `${capitalised(formatShortDay(isoDay(dayOf(leaves)), locale), locale)}, ${formatClock(leaves)}`;
  const href: AppPath =
    booking.viewer === "driver"
      ? { pathname: "/drive/trips/[id]", params: { id: booking.trip.id } }
      : { pathname: "/bookings/[id]", params: { id: booking.id } };
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${dayAtTime(t, locale, leaves)}, ${t("trip.stretchSpoken", names)}`}
      {...linkProps(href)}
      {...hover}
      style={({ pressed }) => [
        styles.ride,
        { backgroundColor: pressed || hovered ? palette.primarySoft : palette.background },
      ]}
    >
      <Icon icon={Ticket} color={palette.text} size={iconSizes.inline} />
      <Text style={[typography.small, styles.rideWords, { color: palette.text }]}>
        <Text style={typography.label}>{when}</Text>
        {` ${t("search.route", names)}`}
      </Text>
      <Icon icon={ChevronRight} color={palette.textMuted} size={iconSizes.inline} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.sm },
  // At the top of a name of several lines, as the two buttons are (spec 31, 3.18).
  top: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  ride: {
    minHeight: sizes.iconButton,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.control,
    paddingHorizontal: spacing.ms,
    paddingVertical: spacing.sm,
  },
  // A place name wider than the line breaks; it does not widen the line.
  rideWords: { flex: 1, minWidth: 0 },
});
