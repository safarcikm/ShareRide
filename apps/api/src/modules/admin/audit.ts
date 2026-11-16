import { schema, type Database } from "@shareride/db";
import { isAuditAction } from "@shareride/domain";
import type { Context } from "hono";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

/** Where a console action came from (spec 9, 3.8). */
export interface AuditRequest {
  readonly ipAddress: string;
  readonly userAgent: string | null;
}

export interface AuditEntry {
  /**
   * Who acted. `sessionId` is null for an action taken through a command on
   * the server, which has no console session.
   */
  readonly operator: { readonly userId: string; readonly sessionId: string | null };
  /** A dotted name, the record's kind first: `meeting_point.activated`. */
  readonly action: string;
  readonly subjectType?: string;
  readonly subjectId?: string;
  /**
   * The changed fields before and after (`changedFields` in the domain).
   * IDs and fields of operator-curated records only: for a person's record,
   * name the fields that changed, never their values (spec 9, section 7).
   */
  readonly before?: Record<string, unknown>;
  readonly after?: Record<string, unknown>;
  /** The console request, or null for a command. */
  readonly request: AuditRequest | null;
}

const userAgentLength = 300;

/** The address and browser of a console request, for its audit entries. */
export function auditRequestOf(c: Context, clientAddress: (c: Context) => string): AuditRequest {
  const userAgent = c.req.header("user-agent");
  return {
    ipAddress: clientAddress(c),
    userAgent: userAgent === undefined ? null : userAgent.slice(0, userAgentLength),
  };
}

/**
 * Writes one entry to the append-only audit log (R9.7, R10.8). Call it with
 * the transaction that makes the change, so the change and its entry are
 * saved together or not at all.
 */
export async function recordAudit(db: Executor, entry: AuditEntry): Promise<void> {
  if (!isAuditAction(entry.action)) {
    throw new Error(`"${entry.action}" is not an audit action name.`);
  }
  // The time is the database's own, set by a trigger, so no caller can backdate an entry.
  await db.insert(schema.auditLog).values({
    operatorUserId: entry.operator.userId,
    operatorSessionId: entry.operator.sessionId,
    action: entry.action,
    subjectType: entry.subjectType ?? null,
    subjectId: entry.subjectId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ipAddress: entry.request?.ipAddress ?? null,
    userAgent: entry.request?.userAgent ?? null,
  });
}
