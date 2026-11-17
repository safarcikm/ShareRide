// The reliability figure (spec 8, 3.8; rules R8.10 and R8.11): one figure
// per person across both roles, the share of trips and bookings kept out of
// those that count over the last 12 months. It helps people choose; it
// never suspends anyone. The operator watches who falls below 80% and
// decides, as a person, on a warning or a suspension.
import type { DisputeOutcome } from "../bookings/disputes.ts";
import type { BookingStatus } from "../bookings/lifecycle.ts";
import type { TripStatus } from "../trips/trip.ts";

/** The values the operator will set (spec 8, section 6; feature H4). */
export interface ReliabilitySettings {
  /** Records count for this many months (`reliability_period`). */
  readonly periodMonths: number;
  /** The figure is shown once this many count (`reliability_min_count`). */
  readonly minCount: number;
  /** Below this percent, the operator sees the person (`reliability_watch_level`). */
  readonly watchPercent: number;
}

/** Decision 3 of spec 8 (2026-11-13). */
export const defaultReliabilitySettings: ReliabilitySettings = {
  periodMonths: 12,
  minCount: 5,
  watchPercent: 80,
};

export type Role = "driver" | "passenger";

/** One trip or booking that counts, and whether its person kept it. */
export interface ReliabilityRecord {
  readonly role: Role;
  /** When it was kept or broken. */
  readonly at: Date;
  readonly kept: boolean;
}

export interface BookingForReliability {
  readonly status: BookingStatus;
  readonly cancelledBy: "passenger" | "driver" | "operator" | null;
  /**
   * Whether its cancellation counts (spec 6), or the operator overruled its
   * reason (R8.11). A driver absence that stood, or a passenger left
   * behind, is cancelled as if by the driver and counts (`disputeEffect`).
   */
  readonly countsOnReliability: boolean;
  /** How a report on it ended; null while it is open, or with none. */
  readonly reportOutcome: DisputeOutcome | null;
  readonly at: Date;
}

/** A no-show the passenger can no longer contest: it stands, or was found their absence. */
const noShowStands = (outcome: DisputeOutcome | null) =>
  outcome === "stands" || outcome === "passenger_absent";

/**
 * Whether the driver came for this booking's passenger: it completed, or
 * it is a no-show that stands (`TripForReliability.passengersDue`).
 */
export function passengerWasDue(
  booking: Pick<BookingForReliability, "status" | "reportOutcome">,
): boolean {
  return (
    booking.status === "completed" ||
    (booking.status === "no_show" && noShowStands(booking.reportOutcome))
  );
}

/**
 * The passenger's side of a booking: kept once completed; not kept as a
 * no-show that stands, or when their own cancellation counts (spec 6,
 * R6.8). A no-show counts only once it stands: while the passenger can
 * answer, or the operator decides, it may yet end as "rode" or "left
 * behind" (R8.6, R8.7). Nothing else counts: early cancellations, withdrawn
 * or declined requests, unpaid bookings.
 */
export function passengerRecord(booking: BookingForReliability): ReliabilityRecord | null {
  const record = (kept: boolean) => ({ role: "passenger", at: booking.at, kept }) as const;
  if (booking.status === "completed") return record(true);
  if (booking.status === "no_show") {
    // Marked by the driver and standing, or the passenger's own report that
    // the driver didn't come, found to be their absence (spec 8, decision 5).
    return noShowStands(booking.reportOutcome) ? record(false) : null;
  }
  if (
    booking.status === "cancelled" &&
    booking.cancelledBy === "passenger" &&
    booking.countsOnReliability
  ) {
    return record(false);
  }
  return null;
}

/**
 * The driver's side of one booking: not kept when the driver cancelled it
 * and that counts (spec 6), which includes a driver absence that stood. A
 * whole trip's cancellation counts once, on the trip.
 */
export function driverBookingRecord(booking: BookingForReliability): ReliabilityRecord | null {
  return booking.status === "cancelled" &&
    booking.cancelledBy === "driver" &&
    booking.countsOnReliability
    ? { role: "driver", at: booking.at, kept: false }
    : null;
}

export interface TripForReliability {
  readonly status: TripStatus;
  readonly countsOnReliability: boolean;
  /**
   * The passengers the driver came for: its completed bookings and its
   * no-shows that stand. A driver whose passengers all failed to come
   * still kept the trip.
   */
  readonly passengersDue: number;
  readonly at: Date;
}

/**
 * A trip, for its driver: kept once completed with at least one passenger
 * due; not kept when cancelled and that counts. A trip without passengers
 * does not count.
 */
export function driverTripRecord(trip: TripForReliability): ReliabilityRecord | null {
  if (trip.status === "completed" && trip.passengersDue > 0) {
    return { role: "driver", at: trip.at, kept: true };
  }
  if (trip.status === "cancelled" && trip.countsOnReliability) {
    return { role: "driver", at: trip.at, kept: false };
  }
  return null;
}

/**
 * R8.11: in the beta a weather or road-closure reason is trusted, so it
 * does not count; the operator can overrule a clearly wrong one, and it
 * then counts. Only a cancellation that does not count because of that
 * reason alone (`excusedByReason`, `tripExcusedByReason`), and once.
 */
export function canOverrule(cancellation: {
  readonly countsOnReliability: boolean;
  readonly excusedByReason: boolean;
}): boolean {
  return cancellation.excusedByReason && !cancellation.countsOnReliability;
}

export interface Reliability {
  readonly kept: number;
  readonly counted: number;
  /** Shown once 5 count, rounded down so that 100% means every one kept. */
  readonly percent: number | null;
  /** The counts behind the figure, by role (3.8.3). */
  readonly byRole: Readonly<Record<Role, { readonly kept: number; readonly counted: number }>>;
  /** Below the watch level: the operator looks, and decides (3.8.4). */
  readonly belowWatchLevel: boolean;
}

/**
 * Where the period that counts begins: the same day and time
 * `periodMonths` earlier, or that month's last day when it is shorter.
 */
export function reliabilitySince(now: Date, settings: ReliabilitySettings): Date {
  const since = new Date(now);
  since.setUTCDate(1);
  since.setUTCMonth(since.getUTCMonth() - settings.periodMonths);
  const year = since.getUTCFullYear();
  const lastDay = new Date(Date.UTC(year, since.getUTCMonth() + 1, 0)).getUTCDate();
  since.setUTCDate(Math.min(now.getUTCDate(), lastDay));
  return since;
}

export function reliabilityOf(
  records: readonly ReliabilityRecord[],
  now: Date,
  settings: ReliabilitySettings,
): Reliability {
  const since = reliabilitySince(now, settings);
  const byRole = {
    driver: { kept: 0, counted: 0 },
    passenger: { kept: 0, counted: 0 },
  };
  for (const record of records) {
    if (record.at < since || record.at > now) continue;
    byRole[record.role].counted += 1;
    if (record.kept) byRole[record.role].kept += 1;
  }
  const kept = byRole.driver.kept + byRole.passenger.kept;
  const counted = byRole.driver.counted + byRole.passenger.counted;
  const percent = counted < settings.minCount ? null : Math.floor((kept * 100) / counted);
  return {
    kept,
    counted,
    percent,
    byRole,
    belowWatchLevel: percent !== null && percent < settings.watchPercent,
  };
}
