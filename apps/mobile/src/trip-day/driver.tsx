import { driverCheckInRoute, type Booking, type MyTrip } from "@shareride/contracts";
import { driverCheckInStops, type Arrival } from "@shareride/domain";
import { formatClock, type Translate } from "@shareride/i18n";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Tag, type TagKind } from "@/components/tag";
import { Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { controlOutline, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { ImHere } from "./im-here";
import { firstNameOf } from "@/people/texts";
import { noShowOpen } from "./reports";

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

/** A no-show is a problem, red as on the booking (spec 31, 3.3). */
const arrivalTag: Record<Arrival, TagKind> = {
  not_here: "info",
  here: "positive",
  no_show: "problem",
};

/** "Gunna, 1 seat, Here": a passenger getting in, as a screen reader says them. */
function riderLabel(t: Translate, booking: Booking, arrival: Arrival | null) {
  return [
    firstNameOf(t, booking.passenger),
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
      <Avatar
        firstName={firstNameOf(t, booking.passenger)}
        colour={booking.passenger.colour}
        photo={booking.passenger.photo}
      />
      <View style={styles.grow}>
        <Text style={[typography.bodyStrong, { color: palette.text }]}>
          {firstNameOf(t, booking.passenger)}
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
 * each stop where it is open now, after the last one where it was said and
 * where someone gets in (`driverCheckInStops`), or when it opens at the
 * next; saying it tells everyone getting in there (3.2). Once the wait
 * after a stop's time has passed, and "I'm here" was said there, each
 * passenger getting in there can be marked as a no-show, which opens its
 * own screen; before "I'm here", the stop says to say it first (3.3).
 */
export function DriverTripDay({
  trip,
  bookings,
  onSaid,
  onStale,
}: {
  readonly trip: MyTrip;
  readonly bookings: readonly Booking[];
  readonly onSaid: () => void;
  /** The trip or a booking changed meanwhile: say so and load it again. */
  readonly onStale: () => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  // Only passengers who board: confirmed, or since a no-show or completed.
  const boarding = bookings.filter((booking) => booking.tripDay !== null);
  const { open, next } = driverCheckInStops(
    trip.stops.map(({ checkIn }) =>
      checkIn === null
        ? null
        : {
            opensAt: new Date(checkIn.opensAt),
            closesAt: new Date(checkIn.closesAt),
            at: checkIn.at === null ? null : new Date(checkIn.at),
          },
    ),
    new Set(
      boarding
        .filter((booking) => booking.status === "confirmed")
        .map((booking) => booking.board.position),
    ),
    now(),
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
        const saidHere = checkIn !== null && checkIn.at !== null;
        const markable = gettingIn.filter((booking) => noShowOpen(booking, now()));
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
                  <View key={booking.id} style={styles.group}>
                    <Rider booking={booking} arrival={booking.tripDay?.arrival ?? null} />
                    {saidHere && markable.includes(booking) ? (
                      <View style={styles.end}>
                        <Button
                          variant="text"
                          label={t("tripDay.markNoShow")}
                          accessibilityLabel={t("tripDay.markNoShowOf", {
                            name: firstNameOf(t, booking.passenger),
                          })}
                          onPress={() => {
                            router.push({
                              pathname: "/bookings/[id]/no-show",
                              params: { id: booking.id },
                            });
                          }}
                        />
                      </View>
                    ) : null}
                  </View>
                ))}
                {!saidHere && open.includes(position) && markable.length > 0 ? (
                  <Text style={[typography.small, { color: palette.textMuted }]}>
                    {t("tripDay.noShowNeedsImHere")}
                  </Text>
                ) : null}
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
            {checkIn !== null &&
            (checkIn.at !== null || open.includes(position) || position === next) ? (
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
                  onStale={onStale}
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
  action: { borderTopWidth: controlOutline / 2, paddingTop: spacing.ms },
  end: { flexDirection: "row", justifyContent: "flex-end" },
  grow: { flex: 1 },
});
