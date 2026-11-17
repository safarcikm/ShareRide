import { schema, type Database } from "@shareride/db";
import {
  err,
  ok,
  requestAllowed,
  requestDueAt,
  requestsCountedSince,
  validatePrivacyRequest,
  validateRequestAnswer,
  type PrivacyRequestInput,
  type PrivacyRequestKind,
  type Result,
} from "@shareride/domain";
import { and, asc, eq, gt, isNull, min, count } from "drizzle-orm";
import { recordAudit } from "../admin/audit.ts";
import { recordEvents } from "../notifications/outbox.ts";
import { isOperator } from "./holds.ts";

const { formerMemberId, privacyRequests, users } = schema;

// "Ask about my data" (spec 11, 3.6; R11.7; plan 4.8): a request lands
// with a due date one month later, the operator answers it through the
// `privacy` command, and the answer goes to the person by email.

export interface PrivacyRequestRecord {
  readonly id: string;
  readonly userId: string;
  readonly kind: PrivacyRequestKind;
  readonly text: string;
  readonly receivedAt: Date;
  readonly dueAt: Date;
  readonly answeredAt: Date | null;
  readonly answer: string | null;
}

export type AskError =
  | { readonly code: "request_text_invalid" }
  | { readonly code: "email_required" }
  | { readonly code: "rate_limited"; readonly retryAfterSeconds: number };

export type AnswerError =
  | { readonly code: "request_answer_invalid" }
  | { readonly code: "request_not_found" }
  | { readonly code: "request_already_answered" }
  | { readonly code: "not_an_operator" };

export interface PrivacyRequests {
  /** A request from the person, who needs a verified email for the answer. */
  ask(userId: string, input: PrivacyRequestInput): Promise<Result<PrivacyRequestRecord, AskError>>;
  /** The requests waiting for an answer, nearest due first. */
  waiting(): Promise<readonly PrivacyRequestRecord[]>;
  /**
   * Answers a request, with its audit entry, and emails the answer unless
   * the account has been erased since (`emailed` false).
   */
  answer(input: {
    readonly requestId: string;
    readonly answer: string;
    readonly operatorUserId: string;
  }): Promise<
    Result<{ readonly request: PrivacyRequestRecord; readonly emailed: boolean }, AnswerError>
  >;
}

const recordOf = (row: typeof privacyRequests.$inferSelect): PrivacyRequestRecord => ({
  id: row.id,
  userId: row.userId,
  kind: row.kind as PrivacyRequestKind,
  text: row.text,
  receivedAt: row.receivedAt,
  dueAt: row.dueAt,
  answeredAt: row.answeredAt,
  answer: row.answer,
});

export function createPrivacyRequests({
  db,
  clock,
}: {
  readonly db: Database;
  readonly clock: () => Date;
}): PrivacyRequests {
  return {
    async ask(userId, input) {
      const valid = validatePrivacyRequest(input);
      if (!valid.ok) return valid;
      const now = clock();
      return db.transaction(async (tx): Promise<Result<PrivacyRequestRecord, AskError>> => {
        // Locked, so requests sent at once are counted one after another.
        const [user] = await tx
          .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
          .from(users)
          .where(eq(users.id, userId))
          .for("update");
        if (user?.email === null || user?.emailVerifiedAt === null || user === undefined) {
          return err({ code: "email_required" });
        }
        const [recent] = await tx
          .select({ count: count(), oldest: min(privacyRequests.receivedAt) })
          .from(privacyRequests)
          .where(
            and(
              eq(privacyRequests.userId, userId),
              gt(privacyRequests.receivedAt, requestsCountedSince(now)),
            ),
          );
        const allowed = requestAllowed(recent ?? { count: 0, oldest: null }, now);
        if (!allowed.ok) return allowed;
        const [row] = await tx
          .insert(privacyRequests)
          .values({
            userId,
            kind: valid.value.kind,
            text: valid.value.text,
            receivedAt: now,
            dueAt: requestDueAt(now),
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (row === undefined) throw new Error("The request was not saved.");
        return ok(recordOf(row));
      });
    },

    async waiting() {
      const rows = await db
        .select()
        .from(privacyRequests)
        .where(isNull(privacyRequests.answeredAt))
        .orderBy(asc(privacyRequests.dueAt), asc(privacyRequests.id));
      return rows.map(recordOf);
    },

    async answer({ requestId, answer, operatorUserId }) {
      const valid = validateRequestAnswer(answer);
      if (!valid.ok) return valid;
      if (!(await isOperator(db, operatorUserId))) return err({ code: "not_an_operator" });
      const now = clock();
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(privacyRequests)
          .where(eq(privacyRequests.id, requestId))
          .for("update");
        if (current === undefined) return err({ code: "request_not_found" } as const);
        if (current.answeredAt !== null) return err({ code: "request_already_answered" } as const);
        const [row] = await tx
          .update(privacyRequests)
          .set({ answeredAt: now, answer: valid.value, updatedAt: now })
          .where(eq(privacyRequests.id, requestId))
          .returning();
        if (row === undefined) throw new Error("The answer was not saved.");
        // The log keeps when, not what: the answer stays with the request.
        await recordAudit(tx, {
          operator: { userId: operatorUserId, sessionId: null },
          action: "privacy_request.answered",
          subjectType: "privacy_request",
          subjectId: requestId,
          after: { answeredAt: now.toISOString() },
          request: null,
        });
        const emailed = row.userId !== formerMemberId;
        if (emailed) {
          await recordEvents(
            tx,
            [{ type: "PrivacyRequestAnswered", userId: row.userId, requestId }],
            now,
          );
        }
        return ok({ request: recordOf(row), emailed });
      });
    },
  };
}
