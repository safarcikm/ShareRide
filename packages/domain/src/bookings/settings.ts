// The values the operator will set for booking (spec 5, section 4; pricing
// and seats, "Configuration values"; feature H4). Until the operator settings
// exist they are these defaults, passed to every rule.
import { defaultSearchSettings } from "../trips/search.ts";

export interface BookingSettings {
  /** Booking closes this many minutes before the boarding stop (rule S4); as in search. */
  readonly bookingCutoffMinutes: number;
  /** A request expires this many minutes after it was made… (`request_expiry`, R5.5) */
  readonly requestExpiryMinutes: number;
  /** …or this many minutes before boarding, whichever is earlier… */
  readonly requestLatestBeforeBoardingMinutes: number;
  /** …unless it was made less than this many minutes before boarding: then at the cut-off. */
  readonly lateRequestMinutes: number;
  /** Time to pay after acceptance, never past the cut-off (`payment_window`, rule M1). */
  readonly paymentWindowMinutes: number;
  /** A request's message to the driver, in characters (R5.6). */
  readonly messageMaxLength: number;
}

/** The starting values (decided 2026-11-13, pricing and seats; spec 5). */
export const defaultBookingSettings: BookingSettings = {
  bookingCutoffMinutes: defaultSearchSettings.bookingCutoffMinutes,
  requestExpiryMinutes: 12 * 60,
  requestLatestBeforeBoardingMinutes: 2 * 60,
  lateRequestMinutes: 2 * 60 + 30,
  paymentWindowMinutes: 30,
  messageMaxLength: 300,
};
