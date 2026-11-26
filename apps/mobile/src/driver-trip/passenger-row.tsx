import type { Booking } from "@shareride/contracts";
import { formatClock, formatMoney, type Locale, type Translate } from "@shareride/i18n";
import { router } from "expo-router";
import { ChevronDown, ChevronUp, Flag, MessageCircle, UserRound, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { canCancel, statusKey, statusTag } from "@/booking/status";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { IconButton } from "@/components/icon-button";
import { Timetable } from "@/components/ride-ticket";
import { Row } from "@/components/row";
import { Tag } from "@/components/tag";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { firstNameOf } from "@/people/texts";
import { ReviewSection } from "@/reviews/review-section";
import { useHover } from "@/theme/hover";
import { ringInside } from "@/theme/ring-inside";
import { controlOutline, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** "1 seat, 600 ISK": a passenger's seats and what they pay. */
function seatsText(t: Translate, locale: Locale, booking: Booking): string {
  return [
    t("search.seatCount", { count: booking.seats }),
    booking.total.amount === 0 ? t("results.free") : formatMoney(booking.total, locale),
  ].join(", ");
}

/** Passengers in the order they get in, and of those who get in together, who gets out first. */
export function inRideOrder(bookings: readonly Booking[]): Booking[] {
  return [...bookings].sort(
    (a, b) => a.board.position - b.board.position || a.alight.position - b.alight.position,
  );
}

/**
 * A passenger on a ride I drive, as a row of the passengers' card (spec
 * 31, 3.12, item 4, and decision 11; spec 5, 3.7): their picture, name,
 * part with seats and price, and the booking's status as a tag. A
 * confirmed booking has its conversation (spec 7, R7.1) one press away, on
 * the round button at the right. Pressing the row unfolds it in place:
 * their part as a timetable, with the times they get in and out, then
 * their profile, for the reviews behind the rating (spec 1, 3.5),
 * reporting them (spec 9, 3.1.1), and "Cancel booking", red and last
 * (R31.3), until the time to get in (spec 6, 3.4). Once the ride is done
 * the rating shows under the row without unfolding (spec 8, 3.7).
 *
 * It goes in `ActionRows`: each of its parts is a surface of its own, and
 * the lines between them are the card of rows showing through.
 */
export function PassengerRow({ booking }: { readonly booking: Booking }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const [hovered, hover] = useHover();
  const name = firstNameOf(t, booking.passenger);
  const seats = seatsText(t, locale, booking);
  // "Mjódd to Hella, 1 seat, 600 ISK".
  const part = [
    t("ride.fromTo", {
      from: booking.board.meetingPoint.name[locale],
      to: booking.alight.meetingPoint.name[locale],
    }),
    seats,
  ].join(", ");
  const status = t(statusKey(booking));
  const { profileId } = booking.passenger;
  const toggle = () => {
    setOpen((was) => !was);
  };
  return (
    <View testID="passenger-row" style={styles.row}>
      <View
        style={[styles.face, { backgroundColor: hovered ? palette.primarySoft : palette.surface }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={[name, part, status].join(", ")}
          aria-expanded={open}
          onPress={toggle}
          {...hover}
          {...ringInside}
          style={styles.who}
        >
          <Avatar
            firstName={name}
            colour={booking.passenger.colour}
            photo={booking.passenger.photo}
          />
          <View style={styles.words}>
            <Text style={[typography.bodyStrong, { color: palette.text }]}>{name}</Text>
            <Text style={[typography.small, { color: palette.textMuted }]}>{part}</Text>
            <View style={styles.tag}>
              <Tag kind={statusTag(booking)} label={status} />
            </View>
          </View>
        </Pressable>
        {booking.confirmed === null ? null : (
          <IconButton
            icon={MessageCircle}
            label={t("chat.messageTo", { name })}
            onPress={() => {
              router.push({
                pathname: "/messages/[bookingId]",
                params: { bookingId: booking.id },
              });
            }}
          />
        )}
        {/* The same press for a pointer or a finger; the row itself is the button. */}
        <Pressable
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          tabIndex={-1}
          onPress={toggle}
          {...hover}
          style={styles.chevron}
        >
          <Icon
            testID={open ? "row-chevron-up" : "row-chevron-down"}
            icon={open ? ChevronUp : ChevronDown}
            color={palette.textMuted}
          />
        </Pressable>
      </View>
      {open ? (
        <View testID="passenger-under" style={styles.under}>
          <View style={[styles.part, { backgroundColor: palette.surface }]}>
            <Timetable
              from={{
                time: formatClock(new Date(booking.board.plannedAt)),
                place: booking.board.meetingPoint.name[locale],
              }}
              to={{
                time: formatClock(new Date(booking.alight.plannedAt)),
                place: booking.alight.meetingPoint.name[locale],
              }}
              between={seats}
            />
          </View>
          {profileId === null ? null : (
            <Row
              icon={UserRound}
              title={t("people.open")}
              accessibilityLabel={t("people.openOf", { name })}
              href={{ pathname: "/people/[profileId]", params: { profileId } }}
            />
          )}
          <Row
            icon={Flag}
            title={t("report.person", { name })}
            href={{ pathname: "/report", params: { kind: "user", id: booking.id } }}
          />
          {canCancel(booking, now()) ? (
            <Row
              danger
              icon={X}
              title={t("booking.cancel")}
              accessibilityLabel={t("driverTrip.cancelBooking", { name })}
              onPress={() => {
                router.push({ pathname: "/bookings/[id]/cancel", params: { id: booking.id } });
              }}
            />
          ) : null}
        </View>
      ) : null}
      {booking.review === null ? null : (
        <View style={[styles.review, { backgroundColor: palette.surface }]}>
          <ReviewSection booking={booking} framed={false} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: controlOutline },
  face: {
    minHeight: sizes.row,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.ms,
  },
  who: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.ms,
  },
  words: { flex: 1, minWidth: 0, gap: spacing.xs / 2 },
  tag: { flexDirection: "row", marginTop: spacing.xs },
  // As high as the round button beside it, so the two stand level.
  chevron: { height: sizes.iconButton, justifyContent: "center" },
  under: { gap: controlOutline },
  part: { paddingHorizontal: spacing.md, paddingVertical: spacing.ms },
  review: { paddingHorizontal: spacing.md, paddingVertical: spacing.ms, gap: spacing.sm },
});
