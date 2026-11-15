import type { Me } from "@shareride/contracts";
import { router } from "expo-router";
import { signUpRoute } from "@/auth/next-route";
import { now } from "@/lib/clock";
import { keepPendingOffer } from "./pending-offer";

/**
 * "Offer a ride": the Offer place of the menu for an account that is set
 * up; otherwise signing up first, with the offer kept so Offer opens after
 * it (spec 1, 3.1, item 3; spec 16, 3.1).
 */
export function offerRide(me: Me | null): void {
  if (me !== null && me.missingSteps.length === 0) {
    router.navigate("/offer");
    return;
  }
  void keepPendingOffer(now()).then(() => {
    router.push(signUpRoute(me));
  });
}
