import { passengerCheckInRoute, type Booking } from "@shareride/contracts";
import { useSession } from "@/auth/session";
import { useLanguage } from "@/i18n/language";
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

/**
 * Whether "I'm here" shows anything for the booking's passenger at this
 * moment (spec 8, 3.2): what it told, the button, or when it opens; nothing
 * once it has closed unsaid.
 */
export function showsImHere(booking: Booking, at: Date): boolean {
  const { tripDay } = booking;
  return (
    tripDay !== null &&
    (tripDay.passengerCheckedInAt !== null ||
      at.getTime() <= new Date(tripDay.checkInClosesAt).getTime())
  );
}

/**
 * The passenger's "I'm here", which tells the driver (spec 8, 3.2). That
 * the driver is at the meeting point is the page's title (spec 31, 3.9).
 * The page keeps when it was `said`, and whether focus has gone to what
 * that told (`focusSaid`, `onSaidFocused`), as it moves this between its
 * bar and its side column.
 */
export function PassengerImHere({
  booking,
  said,
  focusSaid,
  onSaidFocused,
  onSaid,
  onStale,
}: {
  readonly booking: Booking;
  readonly said: string | null;
  readonly focusSaid: boolean;
  readonly onSaidFocused: () => void;
  readonly onSaid: (checkedInAt: string) => void;
  /** The booking changed meanwhile, such as cancelled: say why and load it again. */
  readonly onStale: (why: string) => void;
}) {
  const { t } = useLanguage();
  const session = useSession();
  const { tripDay } = booking;
  if (tripDay === null) return null;
  return (
    <ImHere
      state={{
        opensAt: tripDay.checkInOpensAt,
        closesAt: tripDay.checkInClosesAt,
        at: tripDay.passengerCheckedInAt,
      }}
      told={t("tripDay.toldDriver")}
      send={() => session.call(passengerCheckInRoute, { params: { id: booking.id }, body: {} })}
      said={said}
      focusSaid={focusSaid}
      onSaidFocused={onSaidFocused}
      onSaid={onSaid}
      onStale={() => {
        onStale(t("tripDay.bookingChanged"));
      }}
    />
  );
}
