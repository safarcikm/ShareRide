// Google Analytics on the website, only after the visitor accepts (spec 23,
// ADR 0045): how long the choice holds, and the settings it is loaded with.
import { addIcelandMonths } from "../privacy/calendar.ts";

/** A choice about Google Analytics is asked again after this many months (R23.5). */
export const analyticsConsentMonths = 12;

/**
 * Whether a choice saved at `savedAt` still holds at `now`. One saved
 * after now, as with a clock set wrong, does not: the bar asks again.
 */
export function consentHolds(savedAt: Date, now: Date): boolean {
  if (savedAt.getTime() > now.getTime()) return false;
  return now.getTime() < addIcelandMonths(savedAt, analyticsConsentMonths).getTime();
}

/** How long Google's cookies last: 13 months, and a visit does not extend them (3.3, item 5). */
export const googleCookieExpirySeconds = 395 * 24 * 3600;

const measurementId = /^G-[A-Z0-9]{4,20}$/;

/** A Google Analytics 4 measurement ID, such as G-ABC123XYZ9 (section 6). */
export const isGoogleMeasurementId = (value: string): boolean => measurementId.test(value);
