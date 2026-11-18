import type { MyTrip } from "@shareride/contracts";
import type { TripLoad } from "@shareride/domain";
import type { Translate } from "@shareride/i18n";

/**
 * The trip as its limit sees it (rule P3, spec 17): its stretches, the
 * seats taken on each, what its bookings pay the driver, and these seats.
 */
export function tripLoad(trip: MyTrip, seats = trip.seats): TripLoad {
  return {
    distancesM: trip.segments.map((segment) => segment.distanceM),
    occupancy: trip.segments.map((segment) => segment.seatsTaken),
    seats,
    takings: trip.takings.amount,
  };
}

/** Why the trip limit, not the seats, sets the highest level (spec 17, section 9). */
export function limitUsedText(t: Translate, level: number): string {
  return level === 0 ? t("trip.price.limitUsedFree") : t("trip.price.limitUsed", { level });
}
