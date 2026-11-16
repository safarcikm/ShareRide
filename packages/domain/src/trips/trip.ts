// What a driver chooses for a trip besides the route and times (spec 3,
// 3.7): seats, booking mode and preferences, with the first trip's defaults.
import { suggestedPriceLevel } from "./prices.ts";

/** A trip's life (domain model). */
export const tripStatuses = ["draft", "published", "departed", "completed", "cancelled"] as const;
export type TripStatus = (typeof tripStatuses)[number];

/**
 * Whether a trip takes bookings (rule S4): published, or under way, as a
 * later stop can still be booked once the trip has left its first one
 * (Martin, 2026-11-16). Each stop closes at its own cut-off.
 */
export function takesBookings(status: TripStatus): boolean {
  return status === "published" || status === "departed";
}

export const bookingModes = ["approval", "instant"] as const;
export type BookingMode = (typeof bookingModes)[number];

export const luggageOptions = ["small_bag", "suitcase", "by_arrangement"] as const;
export const petOptions = ["no", "ask", "yes"] as const;
export const smokingOptions = ["no", "breaks_outside"] as const;
export const chatOptions = ["quiet", "some", "chatty"] as const;

export interface TripPreferences {
  /** Luggage per passenger. */
  readonly luggage: (typeof luggageOptions)[number];
  readonly pets: (typeof petOptions)[number];
  readonly smoking: (typeof smokingOptions)[number];
  readonly childSeat: boolean;
  readonly chat: (typeof chatOptions)[number];
}

export interface TripChoices {
  readonly seats: number;
  readonly priceLevel: number;
  readonly bookingMode: BookingMode;
  readonly preferences: TripPreferences;
}

/**
 * A first trip's choices: 3 seats, the suggested prices, approval of each
 * passenger in the beta and no smoking (spec 3, 3.6.3 and 3.7). Later trips
 * start from the driver's previous one.
 */
export const firstTripChoices: TripChoices = {
  seats: 3,
  priceLevel: suggestedPriceLevel,
  bookingMode: "approval",
  preferences: {
    luggage: "suitcase",
    pets: "ask",
    smoking: "no",
    childSeat: false,
    chat: "some",
  },
};

/** Drafts are deleted this many days after their last change, or once their departure has passed (R3.11). */
export const draftRetentionDays = 30;
