import { useState } from "react";
import { tripsPath } from "../reports/texts.ts";
import { TripDetail } from "./detail.tsx";
import { TripSearch } from "./search.tsx";

/**
 * The Trips section (spec 9, 3.5): finding trips at its own path, and each
 * trip at its ID with every booking and request on it.
 */
export function TripsPage() {
  const [rest] = useState(() =>
    window.location.pathname.slice(tripsPath.length).replace(/^\/+|\/+$/g, ""),
  );
  return rest === "" ? <TripSearch /> : <TripDetail id={rest} />;
}
