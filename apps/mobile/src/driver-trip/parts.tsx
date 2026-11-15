import type { Booking, MyTrip, TripBookings } from "@shareride/contracts";
import { formatClock, formatMoney, type Locale, type Translate } from "@shareride/i18n";
import { StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/avatar";
import { Card } from "@/components/card";
import { Tag } from "@/components/tag";
import { statusKey, statusTag } from "@/booking/status";
import { useLanguage } from "@/i18n/language";
import { controlOutline, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

// Parts of the driver's trip page (spec 5, 3.3 and 3.7): the seats held on
// each stretch, and the passengers grouped by where they get in and out.

type Segments = TripBookings["segments"];

/** A stretch's ends by stop position, in the language on screen. */
function stretchNames(trip: MyTrip, position: number, locale: Locale) {
  return {
    from: trip.stops[position]?.meetingPoint.name[locale] ?? "",
    to: trip.stops[position + 1]?.meetingPoint.name[locale] ?? "",
  };
}

const heldOn = (segments: Segments, position: number) =>
  segments.find((segment) => segment.position === position)?.occupancy ?? 0;

/**
 * Seats on a stretch as a bar: seats taken, then the ones a request would
 * add, then free ones. The words beside it say the same, for screen readers.
 */
function SeatBar({
  taken,
  adding = 0,
  capacity,
}: {
  readonly taken: number;
  readonly adding?: number;
  readonly capacity: number;
}) {
  const palette = usePalette();
  const share = (count: number) =>
    `${String((Math.min(count, capacity) / capacity) * 100)}%` as const;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.bar, { backgroundColor: palette.background, borderColor: palette.border }]}
    >
      <View style={{ width: share(taken), backgroundColor: palette.primary }} />
      {adding === 0 ? null : (
        <View style={{ width: share(adding), backgroundColor: palette.primarySoft }} />
      )}
    </View>
  );
}

/** Each stretch of the trip with the seats held on it (rule S1). */
export function Stretches({
  trip,
  segments,
  capacity,
}: {
  readonly trip: MyTrip;
  readonly segments: Segments;
  readonly capacity: number;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  return (
    <View style={styles.list}>
      {trip.stops.slice(1).map((_stop, position) => {
        const names = stretchNames(trip, position, locale);
        const taken = t("driverTrip.taken", { taken: heldOn(segments, position), capacity });
        return (
          <View
            key={position}
            accessible
            accessibilityLabel={`${t("trip.stretchSpoken", names)}, ${taken}`}
            style={styles.stretch}
          >
            <Text style={[typography.label, { color: palette.text }]}>
              {t("trip.stretch", names)}
            </Text>
            <SeatBar taken={heldOn(segments, position)} capacity={capacity} />
            <Text style={[typography.small, { color: palette.textMuted }]}>{taken}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * The stretches of a request's part, with the seats taken without it and
 * with it. A request holds its seats already (rule S1), so accepting adds
 * nothing to what the trip holds; declining frees them.
 */
export function SeatsIfAccepted({
  booking,
  trip,
  segments,
  capacity,
}: {
  readonly booking: Booking;
  readonly trip: MyTrip;
  readonly segments: Segments;
  readonly capacity: number;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const positions = Array.from(
    { length: booking.alight.position - booking.board.position },
    (_unused, index) => booking.board.position + index,
  );
  return (
    <View style={styles.list}>
      {positions.map((position) => {
        const names = stretchNames(trip, position, locale);
        const held = heldOn(segments, position);
        const before = Math.max(0, held - booking.seats);
        const text = t("request.ifAccepted", { taken: before, capacity, after: held });
        return (
          <View
            key={position}
            accessible
            accessibilityLabel={`${t("trip.stretchSpoken", names)}, ${text}`}
            style={styles.stretch}
          >
            <Text style={[typography.label, { color: palette.text }]}>
              {t("trip.stretch", names)}
            </Text>
            <SeatBar taken={before} adding={held - before} capacity={capacity} />
            <Text style={[typography.small, { color: palette.textMuted }]}>{text}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** "Jón, 2 seats, Confirmed": a passenger as a screen reader says them. */
function passengerLabel(t: Translate, booking: Booking) {
  return [
    booking.passenger.firstName,
    t("search.seatCount", { count: booking.seats }),
    t(statusKey(booking)),
  ].join(", ");
}

/**
 * Passengers by where they get in and out, in trip order (spec 5, 3.7),
 * each with their seats, price and status.
 */
export function PassengersByPart({ bookings }: { readonly bookings: readonly Booking[] }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const parts: {
    key: string;
    board: Booking["board"];
    alight: Booking["alight"];
    riding: Booking[];
  }[] = [];
  for (const booking of bookings) {
    const key = `${String(booking.board.position)}-${String(booking.alight.position)}`;
    const part = parts.find((known) => known.key === key);
    if (part === undefined) {
      parts.push({ key, board: booking.board, alight: booking.alight, riding: [booking] });
    } else {
      part.riding.push(booking);
    }
  }
  // In trip order, whatever order they came in.
  parts.sort(
    (a, b) => a.board.position - b.board.position || a.alight.position - b.alight.position,
  );
  return (
    <View style={styles.list}>
      {parts.map(({ key, board, alight, riding }) => {
        const names = {
          from: board.meetingPoint.name[locale],
          to: alight.meetingPoint.name[locale],
        };
        const clock = {
          from: formatClock(new Date(board.plannedAt)),
          to: formatClock(new Date(alight.plannedAt)),
        };
        return (
          <Card key={key}>
            <View
              accessible
              accessibilityLabel={`${t("trip.stretchSpoken", names)}, ${t("myBookings.times", clock)}`}
            >
              <Text style={[typography.label, { color: palette.text }]}>
                {t("trip.stretch", names)}
              </Text>
              <Text style={[typography.small, { color: palette.textMuted }]}>
                {t("trip.stretch", clock)}
              </Text>
            </View>
            {riding.map((booking) => (
              <View
                key={booking.id}
                accessible
                accessibilityLabel={passengerLabel(t, booking)}
                style={[styles.passenger, { borderTopColor: palette.border }]}
              >
                <Avatar firstName={booking.passenger.firstName} colour={booking.passenger.colour} />
                <View style={styles.grow}>
                  <Text style={[typography.bodyStrong, { color: palette.text }]}>
                    {booking.passenger.firstName}
                  </Text>
                  <Text style={[typography.small, { color: palette.textMuted }]}>
                    {[
                      t("search.seatCount", { count: booking.seats }),
                      booking.total.amount === 0
                        ? t("results.free")
                        : formatMoney(booking.total, locale),
                    ].join(" · ")}
                  </Text>
                </View>
                <Tag kind={statusTag(booking)} label={t(statusKey(booking))} />
              </View>
            ))}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  stretch: { gap: spacing.xs },
  bar: {
    flexDirection: "row",
    height: sizes.bar,
    borderRadius: radii.pill,
    borderWidth: controlOutline,
    overflow: "hidden",
  },
  passenger: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.ms,
    paddingTop: spacing.sm,
    borderTopWidth: controlOutline,
  },
  grow: { flex: 1 },
});
