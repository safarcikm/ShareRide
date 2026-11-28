// The CO2 a shared ride saves (spec 34; ADR 0054): one car not driven for
// the passenger's part, compared with driving alone, from the part's road
// distance and the operator's grams per car kilometre. Whatever its seats,
// a booking is one car (R34.1).
import type { BookingStatus } from "../bookings/lifecycle.ts";

/** The road metres of the stretches from `board` up to `alight`, which is not counted. */
export function partDistanceM(
  segmentDistancesM: readonly number[],
  board: number,
  alight: number,
): number {
  return segmentDistancesM.slice(board, alight).reduce((total, metres) => total + metres, 0);
}

/** Whole grams of CO2 one car not driven saves over the distance (R34.2). */
export function co2GramsFor(distanceM: number, gramsPerCarKm: number): number {
  return Math.round((distanceM * gramsPerCarKm) / 1000);
}

/** A part's figure before the ride (3.5); null with the setting at 0, which hides every figure. */
export function estimatedCo2Grams(distanceM: number, gramsPerCarKm: number): number | null {
  return gramsPerCarKm === 0 ? null : co2GramsFor(distanceM, gramsPerCarKm);
}

/** What a booking's figure is made from. */
export interface Co2Booking {
  readonly status: BookingStatus;
  /** The road metres of its part. */
  readonly distanceM: number;
  /** The grams it kept when it completed; null before. */
  readonly storedGrams: number | null;
}

export interface Co2Figure {
  readonly distanceM: number;
  readonly grams: number;
}

/**
 * A booked seat's figure (3.6): estimated at the setting now while it is
 * confirmed, the grams it kept once completed (R34.2); null for a booking
 * that does not count (R34.3) and with the setting at 0.
 */
export function bookingCo2(booking: Co2Booking, gramsPerCarKm: number): Co2Figure | null {
  if (gramsPerCarKm === 0) return null;
  if (booking.status === "confirmed") {
    return {
      distanceM: booking.distanceM,
      grams: co2GramsFor(booking.distanceM, gramsPerCarKm),
    };
  }
  if (booking.status === "completed" && booking.storedGrams !== null) {
    return { distanceM: booking.distanceM, grams: booking.storedGrams };
  }
  return null;
}

/** The driver's figure for a ride (3.7): its bookings' figures added; null when none counts. */
export function tripCo2(bookings: readonly Co2Booking[], gramsPerCarKm: number): Co2Figure | null {
  const figures = bookings.flatMap((booking) => bookingCo2(booking, gramsPerCarKm) ?? []);
  if (figures.length === 0) return null;
  return {
    distanceM: figures.reduce((total, figure) => total + figure.distanceM, 0),
    grams: figures.reduce((total, figure) => total + figure.grams, 0),
  };
}

/** Whole kilograms to show, rounded down; null under 1 kg or without a figure (R34.7). */
export function shownKilograms(grams: number | null): number | null {
  if (grams === null || grams < 1000) return null;
  return Math.floor(grams / 1000);
}

export interface Co2Role {
  readonly grams: number;
  /** Bookings as a passenger; trips as a driver. */
  readonly rides: number;
}

export interface Co2DriverRole extends Co2Role {
  /** The bookings counted on those trips. */
  readonly passengers: number;
}

/** A member's figures by role (spec 34, 3.8). */
export interface Co2Totals {
  readonly asPassenger: Co2Role;
  readonly asDriver: Co2DriverRole;
}

export const noCo2: Co2Totals = {
  asPassenger: { grams: 0, rides: 0 },
  asDriver: { grams: 0, rides: 0, passengers: 0 },
};

export function addCo2Totals(totals: readonly Co2Totals[]): Co2Totals {
  return totals.reduce(
    (sum, next) => ({
      asPassenger: {
        grams: sum.asPassenger.grams + next.asPassenger.grams,
        rides: sum.asPassenger.rides + next.asPassenger.rides,
      },
      asDriver: {
        grams: sum.asDriver.grams + next.asDriver.grams,
        rides: sum.asDriver.rides + next.asDriver.rides,
        passengers: sum.asDriver.passengers + next.asDriver.passengers,
      },
    }),
    noCo2,
  );
}

/** Both roles' grams together: the figure My profile shows. */
export function co2TotalGrams(totals: Co2Totals): number {
  return totals.asPassenger.grams + totals.asDriver.grams;
}
