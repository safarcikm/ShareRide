import type { AdminConversationMessage } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import { err, ok, operatorMayRead, type Result } from "@shareride/domain";
import { asc, eq } from "drizzle-orm";
import { recordAudit, type AuditEntry } from "../admin/audit.ts";
import { asRule } from "../trip-day/disputes.ts";
import { quickOf, systemLineOf } from "./service.ts";

const { bookings, conversations, disputes, messages, reports, trips } = schema;

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * What the operator opens a booking's conversation for, which names the
 * booking: a contested report on the trip day (spec 8, 3.5), or a report of
 * a message (spec 9, 3.4.2).
 */
export interface ConversationSubject {
  readonly type: "dispute" | "report";
  readonly id: string;
}

export interface OperatorReading {
  readonly subject: ConversationSubject;
  readonly operator: AuditEntry["operator"];
  readonly request: AuditEntry["request"];
}

/** No such record, or one that does not let the operator read the conversation. */
export type ReadingRefused = { readonly code: "not_found" } | { readonly code: "not_covered" };

/** The booking whose conversation the subject lets the operator read (R7.3). */
async function coveredBooking(
  tx: Transaction,
  subject: ConversationSubject,
): Promise<Result<string, ReadingRefused>> {
  if (subject.type === "report") {
    // Only a report about a message covers its conversation (R9.6); a
    // booking deleted since leaves nothing to read.
    const [row] = await tx
      .select({ subject: reports.subject, bookingId: reports.bookingId })
      .from(reports)
      .where(eq(reports.id, subject.id));
    if (row === undefined) return err({ code: "not_found" });
    if (row.subject !== "message") return err({ code: "not_covered" });
    if (row.bookingId === null) return err({ code: "not_found" });
    return ok(row.bookingId);
  }
  const [row] = await tx.select().from(disputes).where(eq(disputes.id, subject.id));
  if (row === undefined) return err({ code: "not_found" });
  if (!operatorMayRead(asRule(row))) return err({ code: "not_covered" });
  return ok(row.bookingId);
}

/**
 * A booking's conversation as the operator reads it, oldest first, for the
 * record that covers the reading, which names the booking: the one place
 * that checks the record covers it (R7.3) and logs the opening (R9.6) as
 * `conversation.opened`, in the same transaction, with IDs only, never what
 * was said. A refused reading is not logged. A message whose sender was
 * erased says nothing; once the conversation is deleted, 12 months after
 * the trip, there are no messages, and the opening is still logged. A
 * message ShareRide removed (spec 9, 3.4.3) keeps its words here, marked
 * `removed`, so the operator can weigh an appeal.
 */
export async function readConversationAsOperator(
  db: Database,
  reading: OperatorReading,
): Promise<Result<readonly AdminConversationMessage[], ReadingRefused>> {
  return db.transaction(async (tx) => {
    const covered = await coveredBooking(tx, reading.subject);
    if (!covered.ok) return covered;
    const bookingId = covered.value;
    const [found] = await tx
      .select({ driverId: trips.driverId, conversationId: conversations.id })
      .from(bookings)
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .leftJoin(conversations, eq(conversations.bookingId, bookings.id))
      .where(eq(bookings.id, bookingId));
    if (found === undefined) throw new Error("A report's booking stays while the report does.");
    await recordAudit(tx, {
      operator: reading.operator,
      action: "conversation.opened",
      subjectType: reading.subject.type,
      subjectId: reading.subject.id,
      after: { bookingId, conversationId: found.conversationId },
      request: reading.request,
    });
    if (found.conversationId === null) return ok([]);
    const rows = await tx
      .select()
      .from(messages)
      .where(eq(messages.conversationId, found.conversationId))
      .orderBy(asc(messages.sentAt), asc(messages.id));
    return ok(
      rows.map((row): AdminConversationMessage => {
        const from: AdminConversationMessage["from"] =
          row.senderId === null
            ? "system"
            : row.senderId === found.driverId
              ? "driver"
              : "passenger";
        const said = {
          id: row.id,
          from,
          sentAt: row.sentAt.toISOString(),
          removed: row.hiddenAt !== null,
        };
        if (row.erasedAt !== null) {
          return { ...said, kind: "erased", text: null, quick: null, system: null };
        }
        return {
          ...said,
          kind: row.kind as AdminConversationMessage["kind"],
          text: row.kind === "text" ? row.body : null,
          quick: row.kind === "quick" ? quickOf(row) : null,
          system: row.kind === "system" ? systemLineOf(row, "driver") : null,
        };
      }),
    );
  });
}
