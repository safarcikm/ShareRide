import type { Booking } from "@shareride/contracts";
import {
  capitalised,
  formatClock,
  formatDuration,
  formatMoney,
  formatShortDay,
} from "@shareride/i18n";
import { Ticket } from "lucide-react-native";
import { Text } from "react-native";
import { RideTicket, TicketFoot } from "@/components/ride-ticket";
import { useLanguage } from "@/i18n/language";
import { dayOf, isoDay } from "@/lib/days";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * A booked seat's ride on the seat's own page (spec 31, 3.8, item 3;
 * R31.2): the day, marked "Passenger" for the one whose seat it is, the
 * two stops with their times, and under the tear line the seats and what
 * they cost. A seat that is confirmed has the moss edge of a ride that is
 * mine. It is where you are, so nothing opens when it is pressed.
 */
export function BookingTicket({ booking }: { readonly booking: Booking }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const { board, alight } = booking;
  const from = new Date(board.plannedAt);
  const to = new Date(alight.plannedAt);
  return (
    <RideTicket
      testID="booking-ticket"
      day={capitalised(formatShortDay(isoDay(dayOf(from)), locale), locale)}
      tags={
        booking.viewer === "passenger"
          ? [{ label: t("myRides.passenger"), kind: "plain", icon: Ticket }]
          : []
      }
      from={{ time: formatClock(from), place: board.meetingPoint.name[locale] }}
      to={{ time: formatClock(to), place: alight.meetingPoint.name[locale] }}
      between={formatDuration((to.getTime() - from.getTime()) / 1000, locale)}
      mine={booking.status === "confirmed" || booking.status === "completed"}
      foot={
        <TicketFoot
          start={
            <Text style={[typography.label, { color: palette.text }]}>
              {t("search.seatCount", { count: booking.seats })}
            </Text>
          }
          end={
            <Text style={[typography.figure, { color: palette.text }]}>
              {booking.total.amount === 0 ? t("results.free") : formatMoney(booking.total, locale)}
            </Text>
          }
        />
      }
    />
  );
}
