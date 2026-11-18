import { schema, type Database } from "@shareride/db";
import {
  checkFeedback,
  checkReply,
  checkScreenshot,
  err,
  feedbackAllowed,
  feedbackCountedSince,
  ok,
  type FeedbackDraft,
  type FeedbackKind,
  type FeedbackPlatform,
  type FeedbackProblem,
  type FeedbackStatus,
  type FeedbackTooMany,
  type PhotoFileIssue,
  type ReplyProblem,
  type Result,
} from "@shareride/domain";
import { and, count, desc, eq, gt, min, sql } from "drizzle-orm";
import { recordAudit, type AuditEntry } from "../admin/audit.ts";
import { recordEvents } from "../notifications/outbox.ts";

// Feedback from testers (spec 12, 3.3; R12.5): what a person sends, what
// they can read back, and the operator's list, status and one reply.

const { feedback, feedbackScreenshots, users } = schema;

type StoredFeedback = typeof feedback.$inferSelect;

/** Feedback without its picture, as lists show it. */
export interface FeedbackView {
  readonly id: string;
  readonly userId: string;
  readonly kind: FeedbackKind;
  readonly message: string;
  readonly appVersion: string;
  readonly platform: FeedbackPlatform;
  readonly osVersion: string;
  readonly screen: string;
  readonly language: "is" | "en";
  readonly hasScreenshot: boolean;
  readonly status: FeedbackStatus;
  readonly reply: string | null;
  readonly repliedAt: Date | null;
  readonly createdAt: Date;
}

/** Feedback as the console shows it, with the first name of who sent it. */
export interface AdminFeedbackView extends FeedbackView {
  readonly firstName: string | null;
}

export type SendFeedbackError =
  | FeedbackProblem
  | { readonly code: "screenshot_invalid"; readonly issue: PhotoFileIssue }
  | FeedbackTooMany;

type By = Pick<AuditEntry, "operator" | "request">;
type NotFound = { readonly code: "not_found" };

export interface FeedbackService {
  /** Stores a person's feedback, with its screenshot if one came. */
  send(
    userId: string,
    draft: FeedbackDraft & { readonly screenshot?: Uint8Array },
  ): Promise<Result<FeedbackView, SendFeedbackError>>;
  /** What the person sent, newest first; nobody else's. */
  mine(userId: string): Promise<readonly FeedbackView[]>;
  /** The console's list: newest first, at most 100, with how many are new. */
  list(filter: {
    readonly status?: FeedbackStatus | undefined;
    readonly kind?: FeedbackKind | undefined;
  }): Promise<{ readonly feedback: readonly AdminFeedbackView[]; readonly newCount: number }>;
  one(id: string): Promise<AdminFeedbackView | undefined>;
  /** The picture, with an audit entry: it can show anything that was on the person's screen. */
  screenshot(id: string, by: By): Promise<Buffer | undefined>;
  setStatus(
    id: string,
    status: FeedbackStatus,
    by: By,
  ): Promise<Result<AdminFeedbackView, NotFound>>;
  /** The one reply, sent to the person by push and email. */
  reply(
    id: string,
    reply: string,
    by: By,
  ): Promise<
    Result<AdminFeedbackView, ReplyProblem | NotFound | { readonly code: "already_replied" }>
  >;
}

const hasScreenshot = sql<boolean>`exists (select 1 from ${feedbackScreenshots} where ${feedbackScreenshots.feedbackId} = ${feedback.id})`;

const viewOf = (row: StoredFeedback, picture: boolean): FeedbackView => ({
  id: row.id,
  userId: row.userId,
  kind: row.kind as FeedbackKind,
  message: row.message,
  appVersion: row.appVersion,
  platform: row.platform as FeedbackPlatform,
  osVersion: row.osVersion,
  screen: row.screen,
  language: row.language === "is" ? "is" : "en",
  hasScreenshot: picture,
  status: row.status as FeedbackStatus,
  reply: row.reply,
  repliedAt: row.repliedAt,
  createdAt: row.createdAt,
});

const listLimit = 100;

export function createFeedbackService({
  db,
  clock,
}: {
  readonly db: Database;
  readonly clock: () => Date;
}): FeedbackService {
  const adminRows = (where: ReturnType<typeof and>) =>
    db
      .select({ row: feedback, picture: hasScreenshot, firstName: users.firstName })
      .from(feedback)
      .innerJoin(users, eq(users.id, feedback.userId))
      .where(where)
      .orderBy(desc(feedback.createdAt), desc(feedback.id))
      .limit(listLimit);

  const adminView = (found: {
    readonly row: StoredFeedback;
    readonly picture: boolean;
    readonly firstName: string | null;
  }): AdminFeedbackView => ({ ...viewOf(found.row, found.picture), firstName: found.firstName });

  const one = async (id: string) => {
    const [found] = await adminRows(eq(feedback.id, id));
    return found === undefined ? undefined : adminView(found);
  };

  return {
    async send(userId, draft) {
      const checked = checkFeedback(draft);
      if (!checked.ok) return checked;
      const { screenshot } = draft;
      const size = screenshot === undefined ? undefined : checkScreenshot(screenshot);
      if (size !== undefined && !size.ok) {
        return err({ code: "screenshot_invalid", issue: size.error });
      }
      const now = clock();
      return db.transaction(async (tx): Promise<Result<FeedbackView, SendFeedbackError>> => {
        // Locked, so feedback sent at once is counted one after another.
        const [user] = await tx
          .select({ locale: users.locale })
          .from(users)
          .where(eq(users.id, userId))
          .for("update");
        if (user === undefined) throw new Error("The account sending feedback is gone.");
        const [recent] = await tx
          .select({ count: count(), oldest: min(feedback.createdAt) })
          .from(feedback)
          .where(
            and(eq(feedback.userId, userId), gt(feedback.createdAt, feedbackCountedSince(now))),
          );
        const allowed = feedbackAllowed(recent ?? { count: 0, oldest: null }, now);
        if (!allowed.ok) return allowed;
        const [row] = await tx
          .insert(feedback)
          .values({
            userId,
            ...checked.value,
            language: user.locale === "is" ? "is" : "en",
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (row === undefined) throw new Error("The feedback was not saved.");
        if (screenshot !== undefined && size?.ok === true) {
          await tx.insert(feedbackScreenshots).values({
            feedbackId: row.id,
            file: Buffer.from(screenshot),
            width: size.value.width,
            height: size.value.height,
            createdAt: now,
          });
        }
        return ok(viewOf(row, screenshot !== undefined));
      });
    },

    async mine(userId) {
      const rows = await db
        .select({ row: feedback, picture: hasScreenshot })
        .from(feedback)
        .where(eq(feedback.userId, userId))
        .orderBy(desc(feedback.createdAt), desc(feedback.id));
      return rows.map(({ row, picture }) => viewOf(row, picture));
    },

    async list({ status, kind }) {
      const rows = await adminRows(
        and(
          status === undefined ? undefined : eq(feedback.status, status),
          kind === undefined ? undefined : eq(feedback.kind, kind),
        ),
      );
      const [fresh] = await db
        .select({ count: count() })
        .from(feedback)
        .where(eq(feedback.status, "new"));
      return { feedback: rows.map(adminView), newCount: fresh?.count ?? 0 };
    },

    one,

    async screenshot(id, by) {
      return db.transaction(async (tx) => {
        const [picture] = await tx
          .select({ file: feedbackScreenshots.file })
          .from(feedbackScreenshots)
          .where(eq(feedbackScreenshots.feedbackId, id));
        if (picture === undefined) return undefined;
        await recordAudit(tx, {
          ...by,
          action: "feedback.screenshot_viewed",
          subjectType: "feedback",
          subjectId: id,
        });
        return picture.file;
      });
    },

    async setStatus(id, status, by) {
      const now = clock();
      const changed = await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ status: feedback.status })
          .from(feedback)
          .where(eq(feedback.id, id))
          .for("update");
        if (current === undefined) return false;
        if (current.status === status) return true;
        await tx.update(feedback).set({ status, updatedAt: now }).where(eq(feedback.id, id));
        await recordAudit(tx, {
          ...by,
          action: "feedback.status_changed",
          subjectType: "feedback",
          subjectId: id,
          before: { status: current.status },
          after: { status },
        });
        return true;
      });
      const view = changed ? await one(id) : undefined;
      return view === undefined ? err({ code: "not_found" }) : ok(view);
    },

    async reply(id, reply, by) {
      const checked = checkReply(reply);
      if (!checked.ok) return checked;
      const now = clock();
      const done = await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ repliedAt: feedback.repliedAt, status: feedback.status })
          .from(feedback)
          .where(eq(feedback.id, id))
          .for("update");
        if (current === undefined) return "not_found" as const;
        if (current.repliedAt !== null) return "already_replied" as const;
        await tx
          .update(feedback)
          .set({
            reply: checked.value,
            repliedAt: now,
            // A reply shows it was read.
            ...(current.status === "new" ? { status: "read" } : {}),
            updatedAt: now,
          })
          .where(eq(feedback.id, id));
        // The log keeps when, not what: the reply stays with the feedback.
        await recordAudit(tx, {
          ...by,
          action: "feedback.replied",
          subjectType: "feedback",
          subjectId: id,
          after: { repliedAt: now.toISOString() },
        });
        await recordEvents(tx, [{ type: "FeedbackReplied", feedbackId: id }], now);
        return "done" as const;
      });
      if (done !== "done") return err({ code: done });
      const view = await one(id);
      return view === undefined ? err({ code: "not_found" }) : ok(view);
    },
  };
}
