// Pausing, bringing back and retiring a meeting point in the operator
// console (spec 2, 3.6.4 and 3.6.5), and its yearly review (R2.9).
// Activating and moving come with photos and distances.
import { err, ok, type Result } from "../result.ts";
import type { MeetingPointStatus } from "./catalogue.ts";

/** What the operator does to a point's status. */
export const statusChanges = ["pause", "resume", "retire"] as const;
export type StatusChange = (typeof statusChanges)[number];

/**
 * The status a change leads to. `futureTrips` counts the trips still to
 * stop at the point. A pause or a retirement leaves those trips as they
 * are: on a pause their drivers are asked to choose another stop (spec 6),
 * and an active point retiring stays in use for them until the last one.
 * A paused point retires at once: nobody boards there, so going back into
 * use for those trips would undo the pause. Retired is final (R2.2).
 */
export function nextPointStatus(
  status: MeetingPointStatus,
  change: StatusChange,
  futureTrips: number,
): Result<MeetingPointStatus, "not_allowed"> {
  switch (change) {
    case "pause":
      return status === "active" ? ok("paused") : err("not_allowed");
    case "resume":
      return status === "paused" ? ok("active") : err("not_allowed");
    case "retire":
      if (status === "draft" || status === "paused") return ok("retired");
      if (status === "active") return ok(futureTrips > 0 ? "retiring" : "retired");
      return err("not_allowed");
  }
}

export const pauseLimits = {
  /** Letters in each language's reason. */
  reasonMaxLength: 200,
} as const;

/** Why a point is paused, shown to users in their language, and the day it is back in use. */
export interface PauseRequest {
  readonly reasonIs: string;
  readonly reasonEn: string;
  /** A date in Iceland, such as "2026-11-30", or null until the operator brings it back. */
  readonly until: string | null;
}

export type PauseIssue = "required" | "too_long" | "invalid" | "not_after_today";

export interface PauseProblem {
  readonly field: keyof PauseRequest;
  readonly issue: PauseIssue;
}

const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real day of the calendar, written as a date column stores it. */
function isCalendarDate(text: string): boolean {
  const parts = calendarDate.exec(text);
  if (parts === null) return false;
  const [year, month, day] = parts.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * Checks a pause: a reason in both languages and, if given, an end date
 * after today in Iceland. Every problem at once, tidied like the point's
 * other text (NFC, trimmed).
 */
export function validatePause(
  request: PauseRequest,
  today: string,
): Result<PauseRequest, readonly PauseProblem[]> {
  const problems: PauseProblem[] = [];
  const reason = (field: "reasonIs" | "reasonEn", text: string) => {
    const tidied = text.normalize("NFC").trim();
    if (tidied === "") problems.push({ field, issue: "required" });
    else if (Array.from(tidied).length > pauseLimits.reasonMaxLength) {
      problems.push({ field, issue: "too_long" });
    }
    return tidied;
  };
  const reasonIs = reason("reasonIs", request.reasonIs);
  const reasonEn = reason("reasonEn", request.reasonEn);
  const { until } = request;
  if (until !== null) {
    if (!isCalendarDate(until)) problems.push({ field: "until", issue: "invalid" });
    else if (until <= today) problems.push({ field: "until", issue: "not_after_today" });
  }
  return problems.length > 0 ? err(problems) : ok({ reasonIs, reasonEn, until });
}

/** A paused point with an end date is back in use from that day in Iceland. */
export function backInUse(pausedUntil: string | null, today: string): boolean {
  return pausedUntil !== null && today >= pausedUntil;
}

/**
 * When a point is due for its yearly review (R2.9): a year after the
 * operator last confirmed it, on 28 February after a 29 February. None
 * until it has been confirmed, and none for a point not in use: a draft
 * is checked before it is activated, and a retired point never again.
 */
export function reviewDueOn(
  status: MeetingPointStatus,
  lastCheckedOn: string | null,
): string | null {
  if (lastCheckedOn === null || status === "draft" || status === "retired") return null;
  const year = Number(lastCheckedOn.slice(0, 4));
  const monthAndDay = lastCheckedOn.slice(4);
  return `${String(year + 1)}${monthAndDay === "-02-29" ? "-02-28" : monthAndDay}`;
}
