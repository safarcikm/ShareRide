import { tripDetailsRoute, type TripDetails } from "@shareride/contracts";
import type { MessageKey } from "@shareride/i18n";
import { useCallback } from "react";
import { useSession } from "@/auth/session";
import { peekPendingBooking, type PendingBooking } from "@/booking/pending-booking";
import { peekPendingOffer } from "@/drive/pending-offer";
import { now } from "@/lib/clock";
import { useLoaded } from "@/lib/use-loaded";

/**
 * What signing up leads back to (spec 16, 3.5): a booking kept on the way,
 * with its trip for the part and seats chosen (null when the trip could not
 * be loaded), an offer to drive, or nothing.
 */
export type KeptRide =
  | { readonly kind: "none" }
  | { readonly kind: "offer" }
  | {
      readonly kind: "booking";
      readonly choice: PendingBooking;
      readonly trip: TripDetails | null;
    };

/**
 * Looks at what is kept, without taking it (the menu takes it once the
 * account is ready), and loads a kept booking's trip once. Undefined until
 * then.
 */
export function useKeptRide(): KeptRide | undefined {
  const session = useSession();
  const load = useCallback(async (): Promise<KeptRide> => {
    const at = now();
    const choice = await peekPendingBooking(at);
    if (choice === null) return { kind: (await peekPendingOffer(at)) ? "offer" : "none" };
    const answer = await session.call(tripDetailsRoute, {
      params: { id: choice.tripId },
      query: { fromStop: choice.board, toStop: choice.alight, seats: choice.seats },
    });
    return { kind: "booking", choice, trip: answer.ok ? answer.data : null };
  }, [session]);
  return useLoaded(load).value;
}

/** The last step's button, naming what comes after it (3.5 item 4). */
export function createAccountKey(kept: KeptRide | undefined): MessageKey {
  switch (kept?.kind) {
    case "booking":
      return kept.trip?.bookingMode === "approval"
        ? "onboarding.createAndRequest"
        : "onboarding.createAndBook";
    case "offer":
      return "onboarding.createAndOffer";
    case "none":
    case undefined:
      return "onboarding.create";
  }
}
