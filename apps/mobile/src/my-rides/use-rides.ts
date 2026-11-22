import type { CallFailure } from "@shareride/api-client";
import { myBookingsRoute, myTripsRoute } from "@shareride/contracts";
import { useCallback } from "react";
import { useSession } from "@/auth/session";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { mergeRides, type Ride, type When } from "./rides";

type Loaded =
  | { readonly when: When; readonly rides: Ride[] }
  | { readonly when: When; readonly failure: CallFailure };

/**
 * My bookings and the trips I drive for `when`, loaded together each time
 * the screen comes into view (spec 16, section 6). Either failing is one
 * failure, so the screen shows one notice. Undefined while loading; the
 * other list's answer stays out of sight while this one loads. `pull`
 * loads them again for pulling down to refresh (spec 16, 3.9), as
 * `useLoaded` says. Not `on`, as when signed out, there are none,
 * without asking.
 */
export function useRides(
  when: When,
  on = true,
): {
  readonly loaded: Loaded | undefined;
  readonly reload: () => void;
  readonly pull: () => Promise<boolean | null>;
} {
  const session = useSession();
  const load = useCallback(async (): Promise<Loaded> => {
    if (!on) return { when, rides: [] };
    const [bookings, trips] = await Promise.all([
      session.call(myBookingsRoute, { query: { when } }),
      session.call(myTripsRoute, { query: { when } }),
    ]);
    if (!bookings.ok) return { when, failure: bookings };
    if (!trips.ok) return { when, failure: trips };
    return { when, rides: mergeRides(bookings.data.bookings, trips.data.trips, when) };
  }, [session, when, on]);
  const { value, reload, pull } = useLoadedOnFocus(load);
  return {
    loaded: value?.when === when ? value : undefined,
    reload,
    pull: () => pull((loaded) => !("failure" in loaded)),
  };
}
