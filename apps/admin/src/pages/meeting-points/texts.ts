import type { DraftIssue, MeetingPointStatus, MoveIssue } from "@shareride/domain";
import type { MessageKey } from "@shareride/i18n";

export const statusKeys = {
  draft: "admin.meetingPoints.statusDraft",
  active: "admin.meetingPoints.statusActive",
  paused: "admin.meetingPoints.statusPaused",
  retiring: "admin.meetingPoints.statusRetiring",
  retired: "admin.meetingPoints.statusRetired",
} as const satisfies Record<MeetingPointStatus, MessageKey>;

/**
 * A problem with a field: the domain's, the form's own for the spot and
 * the season, or a move's (`validateMove`, and no road to the points in use).
 */
export type FieldIssue = DraftIssue | "unreadable" | "move_needed" | MoveIssue | "no_road";

/** What each problem says; some fields say more than the domain's word. */
export function issueKey(field: string, issue: FieldIssue): MessageKey {
  if (issue === "invalid" && field.startsWith("shelterHours.")) {
    return "admin.meetingPoint.issue.hours";
  }
  if (issue === "invalid" && field === "season") return "admin.meetingPoint.issue.season";
  switch (issue) {
    case "required":
      return "admin.meetingPoint.issue.required";
    case "too_long":
      return "admin.meetingPoint.issue.tooLong";
    case "too_many":
      return "admin.meetingPoint.issue.tooMany";
    case "unknown":
      return "admin.meetingPoint.issue.unknown";
    case "unreadable":
      return "admin.meetingPoint.issue.unreadable";
    case "outside_iceland":
      return "admin.meetingPoint.issue.outsideIceland";
    case "in_future":
      return "admin.meetingPoint.issue.inFuture";
    case "needs_shelter":
      return "admin.meetingPoint.issue.needsShelter";
    case "move_needed":
      return "admin.meetingPoint.issue.moveNeeded";
    case "same_place":
      return "admin.meetingPoint.issue.samePlace";
    case "no_road":
      return "admin.meetingPoint.issue.noRoad";
    case "invalid":
      return "admin.meetingPoint.issue.unknown";
  }
}
