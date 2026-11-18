import { useState } from "react";
import { ReportDetail } from "./detail.tsx";
import { ReportList } from "./list.tsx";
import { reportsPath } from "./texts.ts";

/**
 * The Reports section (spec 9, 3.4): the queue at its own path, open or
 * closed, and each report at its ID, where the operator reads what the
 * system knows, acts and closes it.
 */
export function ReportsPage() {
  const [rest] = useState(() =>
    window.location.pathname.slice(reportsPath.length).replace(/^\/+|\/+$/g, ""),
  );
  return rest === "" ? <ReportList /> : <ReportDetail id={rest} />;
}
