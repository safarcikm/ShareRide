import { schema, type Database } from "@shareride/db";
import {
  checkMeetingPointIssue,
  defaultMeetingPointIssueSettings,
  err,
  meetingPointIssueRetryAfter,
  ok,
  type MeetingPointIssueDraft,
  type MeetingPointIssueProblem,
  type MeetingPointIssueSettings,
  type MeetingPointStatus,
  type Result,
} from "@shareride/domain";
import { and, eq, gt } from "drizzle-orm";

const { meetingPointIssues, meetingPoints, users } = schema;

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
  };
}
