import { useState } from "react";
import { MeetingPointDistances } from "./distances.tsx";
import { MeetingPointForm } from "./form.tsx";
import { MeetingPointImport } from "./import.tsx";
import { MeetingPointList, meetingPointsPath } from "./list.tsx";
import { MeetingPointProblems } from "./problems.tsx";

/**
 * The meeting points section (spec 2, 3.6): the list at its own path, a
 * new point's form at `/new`, importing from a file at `/import`, problem
 * reports at `/problems`, the distances between points at `/distances`,
 * and each point's form at its ID. The path is
 * read when the page opens: a new draft's form gives itself its own address
 * once saved, and stays the same form.
 */
export function MeetingPointsPage() {
  const [rest] = useState(() =>
    window.location.pathname.slice(meetingPointsPath.length).replace(/^\/+|\/+$/g, ""),
  );
  if (rest === "") return <MeetingPointList />;
  if (rest === "import") return <MeetingPointImport />;
  if (rest === "problems") return <MeetingPointProblems />;
  if (rest === "distances") return <MeetingPointDistances />;
  return <MeetingPointForm id={rest === "new" ? undefined : rest} />;
}
