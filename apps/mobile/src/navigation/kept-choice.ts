import type { Href } from "expo-router";
import { bookingHref, takePendingBooking } from "@/booking/pending-booking";
import { takePendingOffer } from "@/drive/pending-offer";
import { takePendingProblem } from "@/meeting-points/pending-problem";

/**
 * Where a choice kept through signing in leads, taking it: the booking
 * someone chose before they had an account (spec 5, 3.1, item 1), Offer
 * when they pressed "Offer a ride" (spec 1, 3.1, item 3), the report form
 * of a meeting point when they pressed "Something wrong here?" (spec 2,
 * 3.5), or nowhere. Each is taken, so none is left for a later sign-in.
 */
export async function takeKeptChoice(at: Date): Promise<Href | null> {
  const booking = await takePendingBooking(at);
  const offer = await takePendingOffer(at);
  const problem = await takePendingProblem(at);
  if (booking !== null) return bookingHref(booking);
  if (offer) return "/offer";
  return problem === null
    ? null
    : { pathname: "/meeting-points/[id]/problem", params: { id: problem } };
}
