import type { Notice } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  appealDueAt,
  canAppeal,
  checkAppeal,
  defaultSafetySettings,
  err,
  isAppealable,
  ok,
  type AppealOutcome,
  type AppealProblem,
  type ModeratedContent,
  type ModerationActionKind,
  type ModerationRule,
  type Result,
  type SafetySettings,
} from "@shareride/domain";
import { and, desc, eq } from "drizzle-orm";

// The person's notices from ShareRide (spec 9, 3.4.4; R9.5): each action
// that affects them, with its statement of reasons, and their one appeal
// within 14 days with its answer. Open while they are suspended, as an
// appeal must be (3.6.2). Never which operator acted or answered.

const { moderationActions } = schema;

export type AppealError = { readonly code: "not_found" } | AppealProblem;

export interface NoticeService {
  /** My notices, the latest first. */
  mine(me: string): Promise<Notice[]>;
  /** Appeals my notice: once, within 14 days, and not a reinstatement. */
  appeal(me: string, actionId: string, text: string): Promise<Result<Notice, AppealError>>;
}

type ActionRow = typeof moderationActions.$inferSelect;

export function createNoticeService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings?: SafetySettings;
}): NoticeService {
  const { db, clock } = dependencies;
  const settings = dependencies.settings ?? defaultSafetySettings;

  function toNotice(row: ActionRow, now: Date): Notice {
    const kind = row.kind as ModerationActionKind;
    const facts = { kind, at: row.createdAt, appealedAt: row.appealedAt };
    return {
      id: row.id,
      kind,
      rule: row.rule as ModerationRule | null,
      reason: row.reason,
      content: row.contentKind === null ? null : { kind: row.contentKind as ModeratedContent },
      until: row.until?.toISOString() ?? null,
      at: row.createdAt.toISOString(),
      appealUntil: isAppealable(kind) ? appealDueAt(row.createdAt, settings).toISOString() : null,
      canAppeal: canAppeal(facts, now, settings),
      appeal:
        row.appealText === null || row.appealedAt === null
          ? null
          : {
              text: row.appealText,
              sentAt: row.appealedAt.toISOString(),
              answer: row.appealAnswer,
              outcome: row.appealOutcome as AppealOutcome | null,
              answeredAt: row.appealAnsweredAt?.toISOString() ?? null,
            },
    };
  }

  return {
    async mine(me) {
      const rows = await db
        .select()
        .from(moderationActions)
        .where(eq(moderationActions.userId, me))
        .orderBy(desc(moderationActions.createdAt), desc(moderationActions.id));
      const now = clock();
      return rows.map((row) => toNotice(row, now));
    },

    async appeal(me, actionId, text) {
      return db.transaction(async (tx) => {
        // Locked against a second appeal sent at the same moment.
        const [row] = await tx
          .select()
          .from(moderationActions)
          .where(and(eq(moderationActions.id, actionId), eq(moderationActions.userId, me)))
          .for("update");
        if (row === undefined) return err({ code: "not_found" });
        const now = clock();
        const checked = checkAppeal(
          { kind: row.kind as ModerationActionKind, at: row.createdAt, appealedAt: row.appealedAt },
          text,
          now,
          settings,
        );
        if (!checked.ok) return checked;
        const [updated] = await tx
          .update(moderationActions)
          .set({ appealText: checked.value, appealedAt: now, updatedAt: now })
          .where(eq(moderationActions.id, actionId))
          .returning();
        if (updated === undefined) throw new Error("The appeal was not stored.");
        return ok(toNotice(updated, now));
      });
    },
  };
}
