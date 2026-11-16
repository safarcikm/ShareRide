import { passengerCheckInRoute, type Booking } from "@shareride/contracts";
import { formatClock } from "@shareride/i18n";
import { Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { ImHere } from "./im-here";

/**
 * Whether the booking page shows the trip day (spec 8, 3.1): for the
 * passenger of a confirmed booking, from 3 hours before boarding until the
 * trip completes.
 */
export function onTripDay(booking: Booking): boolean {
  return (
    booking.viewer === "passenger" &&
    booking.status === "confirmed" &&
    booking.tripDay?.phase === "trip_day"
  );
}

/** The trip day's first lines: when and where to be. */
export function TripDayHeading({ booking }: { readonly booking: Booking }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const { board } = booking;
  return (
    <Card>
      <Heading>{t("tripDay.title")}</Heading>
      <View accessible>
        <Text style={[typography.figure, { color: palette.text }]}>
          {formatClock(new Date(board.plannedAt))}
        </Text>
        <Text style={[typography.bodyStrong, { color: palette.text }]}>
          {board.meetingPoint.name[locale]}
        </Text>
      </View>
    </Card>
  );
}

/**
 * Whether the driver is at the meeting point, and the passenger's "I'm
 * here", which tells the driver (spec 8, 3.2).
 */
export function PassengerImHere({
  booking,
  onSaid,
  onStale,
}: {
  readonly booking: Booking;
  readonly onSaid: () => void;
  /** The booking changed meanwhile, such as cancelled: say why and load it again. */
  readonly onStale: (why: string) => void;
}) {
  const { t } = useLanguage();
  const session = useSession();
  const { tripDay } = booking;
  if (tripDay === null) return null;
  return (
    <>
      {tripDay.driverCheckedInAt === null ? null : (
        <Notice
          kind="info"
          urgent={false}
          message={t("tripDay.otherHere", { name: booking.driver.firstName })}
        />
      )}
      <ImHere
        state={{
          opensAt: tripDay.checkInOpensAt,
          closesAt: tripDay.checkInClosesAt,
          at: tripDay.passengerCheckedInAt,
        }}
        told={t("tripDay.toldDriver")}
        send={() => session.call(passengerCheckInRoute, { params: { id: booking.id }, body: {} })}
        onSaid={onSaid}
        onStale={() => {
          onStale(t("tripDay.bookingChanged"));
        }}
      />
    </>
  );
}
