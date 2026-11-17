import { useState } from "react";
import { MeetingPointForm } from "./form.tsx";
import { MeetingPointImport } from "./import.tsx";
import { MeetingPointList, meetingPointsPath } from "./list.tsx";

/**
 * The meeting points section (spec 2, 3.6): the list at its own path, a
 * new point's form at `/new`, importing from a file at `/import`, and each
 * point's form at its ID. The path is
 * read when the page opens: a new draft's form gives itself its own address
 * once saved, and stays the same form.
 */
export function MeetingPointsPage() {
  const [rest] = useState(() =>
    window.location.pathname.slice(meetingPointsPath.length).replace(/^\/+|\/+$/g, ""),
  );
  if (rest === "") return <MeetingPointList />;
  if (rest === "import") return <MeetingPointImport />;
  return <MeetingPointForm id={rest === "new" ? undefined : rest} />;
}
