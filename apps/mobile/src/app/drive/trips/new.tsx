import { useMe } from "@/auth/session";
import { SuspendedAccount, suspensionNow } from "@/safety/suspended-account";
import { RouteStep } from "@/trips/route-step";

/**
 * Step 1 of a new trip: the route (spec 3, screen 4). Continue starts the
 * draft. Closed to a suspended person (spec 9, 3.6.2).
 */
export default function NewTripScreen() {
  const suspension = suspensionNow(useMe());
  if (suspension !== null) return <SuspendedAccount suspension={suspension} />;
  return <RouteStep />;
}
