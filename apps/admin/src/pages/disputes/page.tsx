import { useState } from "react";
import { DisputeDetail } from "./detail.tsx";
import { DisputeList } from "./list.tsx";
import { disputesPath } from "./texts.ts";

/**
 * The Disputes section (spec 8, 3.5): the contested reports at its own
 * path, waiting or decided, and each report at its ID, where the operator
 * reads what the system knows and decides.
 */
export function DisputesPage() {
  const [rest] = useState(() =>
    window.location.pathname.slice(disputesPath.length).replace(/^\/+|\/+$/g, ""),
  );
  return rest === "" ? <DisputeList /> : <DisputeDetail id={rest} />;
}
