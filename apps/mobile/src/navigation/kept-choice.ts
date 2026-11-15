import type { Href } from "expo-router";
import { bookingHref, takePendingBooking } from "@/booking/pending-booking";
import { takePendingOffer } from "@/drive/pending-offer";

/**
 * Where a choice kept through sign-up leads, taking it: the booking someone
 * chose before they had an account (spec 5, 3.1, item 1), Offer when they
 * pressed "Offer a ride" (spec 1, 3.1, item 3), or nowhere.
 */
export async function takeKeptChoice(at: Date): Promise<Href | null> {
  const booking = await takePendingBooking(at);
  if (booking !== null) return bookingHref(booking);
  return (await takePendingOffer(at)) ? "/offer" : null;
}
