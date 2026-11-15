import type { Me } from "@shareride/contracts";
import { router } from "expo-router";
import { nextRoute } from "@/auth/next-route";
import { now } from "@/lib/clock";
import { keepPendingOffer } from "./pending-offer";

/**
 * "Offer a ride": Ready to drive for an account that is set up; otherwise
 * signing up first, with the offer kept so Ready to drive opens after it
 * (spec 1, 3.1, item 3).
 */
export function offerRide(me: Me | null): void {
  if (me !== null && me.missingSteps.length === 0) {
    router.push("/drive");
    return;
  }
  void keepPendingOffer(now()).then(() => {
    router.push(me === null ? "/sign-in" : nextRoute(me));
  });
}
