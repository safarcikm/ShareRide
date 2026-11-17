// The operator decides a contested report (spec 8, 3.5; decisions 4 and 5):
// the one entry point for the operator's command now and the console's
// pages later (spec 10). The decision is final in the app; both sides are
// told, and the audit log says who decided.
import { schema, type Database } from "@shareride/db";
import {
  checkDecision,
  checkDisputeNote,
  err,
  ok,
  type DecisionProblem,
  type DisputeOutcome,
  type Result,
} from "@shareride/domain";
import { eq } from "drizzle-orm";
import { recordAudit, type AuditEntry } from "../admin/audit.ts";
import { lockTrip } from "../bookings/seats.ts";
import { recordEvents } from "../notifications/outbox.ts";
import { asRule, type DisputeRow } from "./disputes.ts";
import { applyOutcome } from "./outcome.ts";

const { bookings, disputes } = schema;

export type DecideError =
  { readonly code: "not_found" } | { readonly code: "note_too_long" } | DecisionProblem;

export interface DecideInput {
  readonly operator: AuditEntry["operator"];
  readonly disputeId: string;
  readonly outcome: DisputeOutcome;
  /** Why, for complaints later (spec 8, 3.5); the operator's only. */
  readonly note: string;
  readonly request: AuditEntry["request"];
}

/**
 * Decides a contested, open report as `outcome` and applies its effect,
 * with the decision's audit entry and both sides' notifications in the same
 * transaction. That the caller is an operator is the caller's to check.
 */
export async function decideDispute(
  db: Database,
  input: DecideInput,
  now: Date,
): Promise<Result<DisputeRow, DecideError>> {
  const note = checkDisputeNote(input.note);
  if (!note.ok) return note;
  const [found] = await db
    .select({ bookingId: disputes.bookingId, tripId: bookings.tripId })
    .from(disputes)
    .innerJoin(bookings, eq(bookings.id, disputes.bookingId))
    .where(eq(disputes.id, input.disputeId));
  if (found === undefined) return err({ code: "not_found" });
  return db.transaction(async (tx) => {
    // As every change to a trip's bookings does, so a settling job or an
    // answer at the same moment comes first or after, never between.
    await lockTrip(tx, found.tripId);
    const read = async () => {
      const [row] = await tx.select().from(disputes).where(eq(disputes.id, input.disputeId));
      if (row === undefined) throw new Error("A report is never deleted while its trip is locked.");
      return row;
    };
    const dispute = await read();
    const allowed = checkDecision(asRule(dispute), input.outcome);
    if (!allowed.ok) return allowed;
    await applyOutcome(
      tx,
      dispute,
      { outcome: input.outcome, by: "operator", note: note.value },
      now,
    );
    // A person's record: the names of the fields changed, never their values (spec 9, 3.8).
    await recordAudit(tx, {
      operator: input.operator,
      action: "dispute.decided",
      subjectType: "dispute",
      subjectId: dispute.id,
      after: { changed: ["outcome", "decidedBy", "decidedAt", "decisionNote"] },
      request: input.request,
    });
    await recordEvents(tx, [{ type: "DisputeDecided", bookingId: found.bookingId }], now);
    return ok(await read());
  });
}
