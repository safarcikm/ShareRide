import { driverCheckInRoute, type Booking, type MyTrip } from "@shareride/contracts";
import type { Arrival } from "@shareride/domain";
import { formatClock, type Translate } from "@shareride/i18n";
import { StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { Avatar } from "@/components/avatar";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Tag, type TagKind } from "@/components/tag";
import { Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { ImHere } from "./im-here";

/**
 * Whether the driver's trip page shows the trip day (spec 8, 3.1): from 3
 * hours before the first stop until the trip completes.
 */
export function onTripDay(trip: MyTrip): boolean {
  return (trip.status === "published" || trip.status === "departed") && trip.phase === "trip_day";
}

const arrivalKey = {
  not_here: "tripDay.statusNotHere",
  here: "tripDay.statusHere",
  no_show: "tripDay.statusNoShow",
} as const;

const arrivalTag: Record<Arrival, TagKind> = {
  not_here: "info",
  here: "positive",
  no_show: "warning",
};

/** "Gunna, 1 seat, Here": a passenger getting in, as a screen reader says them. */
function riderLabel(t: Translate, booking: Booking, arrival: Arrival | null) {
  return [
    booking.passenger.firstName,
    t("search.seatCount", { count: booking.seats }),
    ...(arrival === null ? [] : [t(arrivalKey[arrival])]),
  ].join(", ");
}

function Rider({
  booking,
  arrival,
}: {
  readonly booking: Booking;
  readonly arrival: Arrival | null;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <View accessible accessibilityLabel={riderLabel(t, booking, arrival)} style={styles.rider}>
      <Avatar firstName={booking.passenger.firstName} colour={booking.passenger.colour} />
      <View style={styles.grow}>
        <Text style={[typography.bodyStrong, { color: palette.text }]}>
          {booking.passenger.firstName}
        </Text>
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {t("search.seatCount", { count: booking.seats })}
        </Text>
      </View>
      {arrival === null ? null : <Tag kind={arrivalTag[arrival]} label={t(arrivalKey[arrival])} />}
    </View>
  );
}

/**
 * The driver's trip day (spec 8, 3.1): "Use this only when parked." at the
 * top, then the stops in order with their times, who gets in at each, with
 * seats and whether they are here, and who gets out. "I'm here" shows at
 * the next stop where it has not been said and has not closed; saying it
 * tells everyone getting in there (3.2).
 */
export function DriverTripDay({
  trip,
  bookings,
  onSaid,
}: {
  readonly trip: MyTrip;
  readonly bookings: readonly Booking[];
  readonly onSaid: () => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const time = now();
  // Only passengers who board: confirmed, or since a no-show or completed.
  const boarding = bookings.filter((booking) => booking.tripDay !== null);
  const next = trip.stops.findIndex(
    (stop) =>
      stop.checkIn !== null && stop.checkIn.at === null && time <= new Date(stop.checkIn.closesAt),
  );
  return (
    <>
      <Heading>{t("tripDay.title")}</Heading>
      <Notice kind="info" urgent={false} message={t("tripDay.parkedOnly")} />
      {trip.stops.map((stop, position) => {
        const name = stop.meetingPoint.name[locale];
        const gettingIn = boarding.filter((booking) => booking.board.position === position);
        // A no-show never got in, so never gets out.
        const gettingOut = boarding.filter(
          (booking) => booking.alight.position === position && booking.status !== "no_show",
        );
        const { checkIn } = stop;
        return (
          <Card key={stop.id}>
            <View accessible style={styles.stop}>
              <Text style={[typography.figureSmall, { color: palette.text }]}>
                {stop.plannedAt === null ? "" : formatClock(new Date(stop.plannedAt))}
              </Text>
              <Text style={[typography.bodyStrong, styles.grow, { color: palette.text }]}>
                {name}
              </Text>
            </View>
            {gettingIn.length === 0 ? null : (
              <View style={styles.group}>
                <Text style={[typography.label, { color: palette.textMuted }]}>
                  {t("tripDay.gettingIn")}
                </Text>
                {gettingIn.map((booking) => (
                  <Rider
                    key={booking.id}
                    booking={booking}
                    arrival={booking.tripDay?.arrival ?? null}
                  />
                ))}
              </View>
            )}
            {gettingOut.length === 0 ? null : (
              <View style={styles.group}>
                <Text style={[typography.label, { color: palette.textMuted }]}>
                  {t("tripDay.gettingOut")}
                </Text>
                {gettingOut.map((booking) => (
                  <Rider key={booking.id} booking={booking} arrival={null} />
                ))}
              </View>
            )}
            {checkIn !== null && (checkIn.at !== null || position === next) ? (
              <View style={[styles.action, { borderTopColor: palette.border }]}>
                <ImHere
                  state={checkIn}
                  told={t("tripDay.toldPassengers")}
                  accessibilityLabel={t("tripDay.imHereAt", { stop: name })}
                  send={() =>
                    session.call(driverCheckInRoute, {
                      params: { id: trip.id, stopId: stop.id },
                      body: {},
                    })
                  }
                  onSaid={onSaid}
                />
              </View>
            ) : null}
          </Card>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  stop: { flexDirection: "row", alignItems: "baseline", gap: spacing.ms },
  group: { gap: spacing.sm },
  rider: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  action: { borderTopWidth: 1, paddingTop: spacing.ms },
  grow: { flex: 1 },
});
