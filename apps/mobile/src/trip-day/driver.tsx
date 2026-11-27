import { driverCheckInRoute, type Booking, type MyTrip } from "@shareride/contracts";
import { driverCheckInStops, type Arrival } from "@shareride/domain";
import { formatClock, type Translate } from "@shareride/i18n";
import { router } from "expo-router";
import { CircleCheck } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
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

/** Only passengers who board: confirmed, or since a no-show or completed. */
const boardingOf = (bookings: readonly Booking[]) =>
  bookings.filter((booking) => booking.tripDay !== null);

/**
 * Where the driver can say "I'm here" at this moment, by stop position,
 * and with none open the next stop where it will open (`driverCheckInStops`).
 */
function imHereStops(trip: MyTrip, bookings: readonly Booking[], at: Date) {
  return driverCheckInStops(
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
      boardingOf(bookings)
        .filter((booking) => booking.status === "confirmed")
        .map((booking) => booking.board.position),
    ),
    at,
  );
}

/** The stop where the driver said "I'm here" on this screen, and when. */
export interface SaidHere {
  readonly position: number;
  readonly at: string;
}

/**
 * The stops the driver's "I'm here" is about at this moment (spec 31, 3.9,
 * item 4), in the order they show: the stop where it was just said here,
 * which then says what that told; then each stop where it is open now, as
 * the windows overlap and the driver picks where they are (spec 8, 3.2),
 * or, with none open, the next stop, which says when it opens. Empty when
 * there is nothing to say, and then the page has no bar.
 */
export function driverImHereStops(
  trip: MyTrip,
  bookings: readonly Booking[],
  said: SaidHere | null,
  at: Date,
): readonly number[] {
  if (!onTripDay(trip)) return [];
  const { open, next } = imHereStops(trip, bookings, at);
  const rest = open.filter((position) => position !== said?.position);
  const ahead = rest.length > 0 || next === null || next === said?.position ? rest : [next];
  return said === null ? ahead : [said.position, ...ahead];
}

/**
 * The driver's "I'm here" (spec 8, 3.2; R8.3), in the bar at the bottom of
 * a phone and at the top of a wide screen's side column (spec 31, 3.9,
 * item 4): one large button naming the stop, which tells everyone getting
 * in there. With more than one stop open, the first is the main button and
 * the others are outlined under it. Before any opens, it says from when;
 * once said, what that told, with focus. The page keeps where it was
 * `said`, and whether focus went to what that told (`focusSaid`,
 * `onSaidFocused`), as it moves this between its bar and its side column.
 */
export function DriverImHere({
  trip,
  stops,
  said,
  focusSaid,
  onSaidFocused,
  onSaid,
  onStale,
}: {
  readonly trip: MyTrip;
  /** From `driverImHereStops`. */
  readonly stops: readonly number[];
  readonly said: SaidHere | null;
  readonly focusSaid: boolean;
  readonly onSaidFocused: () => void;
  readonly onSaid: (said: SaidHere) => void;
  /** The trip or a booking changed meanwhile: say so and load it again. */
  readonly onStale: () => void;
}) {
  const { locale, t } = useLanguage();
  const session = useSession();
  // The first button is the main one; what was said is not a button.
  const main = stops.find((position) => position !== said?.position);
  return (
    <View testID="driver-im-here" style={styles.bar}>
      {stops.map((position) => {
        const stop = trip.stops[position];
        if (stop === undefined || stop.checkIn === null) return null;
        const name = stop.meetingPoint.name[locale];
        const saidHere = said?.position === position;
        return (
          <ImHere
            // What was said takes the place of its button, and takes focus as it does.
            key={saidHere ? `said-${stop.id}` : stop.id}
            state={stop.checkIn}
            told={t("tripDay.toldPassengers")}
            label={t("tripDay.imHereAt", { stop: name })}
            opens={(time) => t("tripDay.opensAtStop", { stop: name, time })}
            outlined={position !== main}
            said={saidHere ? said.at : null}
            focusSaid={focusSaid}
            onSaidFocused={onSaidFocused}
            send={() =>
              session.call(driverCheckInRoute, {
                params: { id: trip.id, stopId: stop.id },
                body: {},
              })
            }
            onSaid={(checkedInAt) => {
              onSaid({ position, at: checkedInAt });
            }}
            onStale={onStale}
          />
        );
      })}
    </View>
  );
}

/**
 * The driver's trip day (spec 8, 3.1): "Use this only when parked." at the
 * top, then the stops in order with their times, who gets in at each, with
 * seats and whether they are here, and who gets out. A stop where the
 * driver said "I'm here" says that the passengers were told; the button
 * itself is in the page's bar (`DriverImHere`; spec 31, 3.9, item 4). Once
 * the wait after a stop's time has passed, and "I'm here" was said there,
 * each passenger getting in there can be marked as a no-show, which opens
 * its own screen; before "I'm here", the stop says to say it first (3.3).
 */
export function DriverTripDay({
  trip,
  bookings,
}: {
  readonly trip: MyTrip;
  readonly bookings: readonly Booking[];
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const boarding = boardingOf(bookings);
  const { open } = imHereStops(trip, bookings, now());
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
            {saidHere ? (
              <View
                testID="said-here"
                accessible
                style={[styles.action, styles.said, { borderTopColor: palette.border }]}
              >
                <Icon icon={CircleCheck} color={palette.primary} />
                <Text style={[typography.bodyStrong, styles.grow, { color: palette.text }]}>
                  {t("tripDay.toldPassengers")}
                </Text>
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
  said: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  bar: { gap: spacing.sm },
  end: { flexDirection: "row", justifyContent: "flex-end" },
  grow: { flex: 1 },
});
