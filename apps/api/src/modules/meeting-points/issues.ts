import { schema, type Database } from "@shareride/db";
import type { AdminMeetingPointIssue } from "@shareride/contracts";
import {
  checkIssueResolution,
  checkMeetingPointIssue,
  defaultMeetingPointIssueSettings,
  err,
  icelandDate,
  meetingPointIssueRetryAfter,
  ok,
  reviewDueOn,
  type IssueResolutionProblem,
  type MeetingPointIssueReason,
  type MeetingPointIssueDraft,
  type MeetingPointIssueProblem,
  type MeetingPointIssueSettings,
  type MeetingPointStatus,
  type Result,
} from "@shareride/domain";
import { and, asc, eq, gt } from "drizzle-orm";
import { recordAudit } from "../admin/audit.ts";
import type { ConsoleActor } from "./admin-service.ts";

const { meetingPointIssues, meetingPoints, users } = schema;

export type IssueResolveError =
  IssueResolutionProblem | { readonly code: "not_found" } | { readonly code: "issue_resolved" };

export type MeetingPointIssueError =
  | MeetingPointIssueProblem
  | { readonly code: "too_many_reports"; readonly retryAfterSeconds: number };

/** Problem reports about meeting points (spec 2, 3.5; R2.8). */
export interface MeetingPointIssueService {
  /** Puts what `me` says is wrong with a point people can see in the operator's queue. */
  report(
    me: string,
    meetingPointId: string,
    draft: MeetingPointIssueDraft,
  ): Promise<Result<null, MeetingPointIssueError>>;
  /** The open reports, the oldest first, for the console; never who sent them. */
  queue(): Promise<AdminMeetingPointIssue[]>;
  /**
   * Resolves an open report with a note on what was done, removing the link
   * to the person who sent it, and marks the point checked today if asked.
   */
  resolve(
    id: string,
    input: { readonly note: string; readonly checkedToday: boolean },
    actor: ConsoleActor,
  ): Promise<Result<null, IssueResolveError>>;
}

const dayMs = 24 * 3_600_000;

export function createMeetingPointIssueService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings?: MeetingPointIssueSettings;
}): MeetingPointIssueService {
  const { db, clock } = dependencies;
  const settings = dependencies.settings ?? defaultMeetingPointIssueSettings;
  return {
    async report(me, meetingPointId, draft) {
      const now = clock();
      const [point] = await db
        .select({ status: meetingPoints.status })
        .from(meetingPoints)
        .where(eq(meetingPoints.id, meetingPointId));
      if (point === undefined) return err({ code: "not_found" });
      const checked = checkMeetingPointIssue(draft, point.status as MeetingPointStatus);
      if (!checked.ok) return checked;

      return db.transaction(async (tx) => {
        // One report at a time per person, so the daily limit holds.
        await tx.select({ id: users.id }).from(users).where(eq(users.id, me)).for("no key update");
        const today = await tx
          .select({ at: meetingPointIssues.createdAt })
          .from(meetingPointIssues)
          .where(
            and(
              eq(meetingPointIssues.reporterId, me),
              gt(meetingPointIssues.createdAt, new Date(now.getTime() - dayMs)),
            ),
          );
        const retryAfterSeconds = meetingPointIssueRetryAfter(
          today.map((row) => row.at),
          now,
          settings,
        );
        if (retryAfterSeconds !== null) return err({ code: "too_many_reports", retryAfterSeconds });
        await tx.insert(meetingPointIssues).values({
          meetingPointId,
          reporterId: me,
          reason: checked.value.reason,
          note: checked.value.note,
          createdAt: now,
          updatedAt: now,
        });
        return ok(null);
      });
    },

    async queue() {
      const rows = await db
        .select({
          id: meetingPointIssues.id,
          pointId: meetingPoints.id,
          nameIs: meetingPoints.nameIs,
          status: meetingPoints.status,
          lastCheckedOn: meetingPoints.lastCheckedOn,
          reason: meetingPointIssues.reason,
          note: meetingPointIssues.note,
          sentAt: meetingPointIssues.createdAt,
        })
        .from(meetingPointIssues)
        .innerJoin(meetingPoints, eq(meetingPoints.id, meetingPointIssues.meetingPointId))
        .where(eq(meetingPointIssues.status, "open"))
        .orderBy(asc(meetingPointIssues.createdAt), asc(meetingPointIssues.id));
      return rows.map((row) => ({
        id: row.id,
        meetingPoint: {
          id: row.pointId,
          nameIs: row.nameIs,
          status: row.status as MeetingPointStatus,
          lastCheckedOn: row.lastCheckedOn,
        },
        reason: row.reason as MeetingPointIssueReason,
        note: row.note,
        sentAt: row.sentAt.toISOString(),
      }));
    },

    async resolve(id, input, actor) {
      const note = checkIssueResolution(input.note);
      if (!note.ok) return note;
      const now = clock();
      const today = icelandDate(now);
      return db.transaction(async (tx): Promise<Result<null, IssueResolveError>> => {
        const [issue] = await tx
          .select({
            status: meetingPointIssues.status,
            meetingPointId: meetingPointIssues.meetingPointId,
            reason: meetingPointIssues.reason,
          })
          .from(meetingPointIssues)
          .where(eq(meetingPointIssues.id, id))
          .for("update");
        if (issue === undefined) return err({ code: "not_found" });
        if (issue.status !== "open") return err({ code: "issue_resolved" });
        await tx
          .update(meetingPointIssues)
          .set({
            status: "resolved",
            resolutionNote: note.value,
            resolvedById: actor.operator.userId,
            resolvedAt: now,
            // The link to the person goes once the report is resolved (spec 2, section 7).
            reporterId: null,
            updatedAt: now,
          })
          .where(eq(meetingPointIssues.id, id));
        let checkedOn: string | null = null;
        if (input.checkedToday) {
          const [point] = await tx
            .select({ status: meetingPoints.status, lastCheckedOn: meetingPoints.lastCheckedOn })
            .from(meetingPoints)
            .where(eq(meetingPoints.id, issue.meetingPointId))
            .for("update");
          // A retired point stays as it was (R2.2).
          if (point !== undefined && point.status !== "retired") {
            checkedOn = today;
            await tx
              .update(meetingPoints)
              .set({
                lastCheckedOn: today,
                reviewDueOn: reviewDueOn(point.status as MeetingPointStatus, today),
                updatedAt: now,
              })
              .where(eq(meetingPoints.id, issue.meetingPointId));
          }
        }
        await recordAudit(tx, {
          operator: actor.operator,
          action: "meeting_point_issue.resolved",
          subjectType: "meeting_point_issue",
          subjectId: id,
          after: {
            meetingPointId: issue.meetingPointId,
            reason: issue.reason,
            resolutionNote: note.value,
            ...(checkedOn === null ? {} : { lastCheckedOn: checkedOn }),
          },
          request: actor.request,
        });
        return ok(null);
      });
    },
  };
}
