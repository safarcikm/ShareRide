import { schema, type Database } from "@shareride/db";
import {
  canUseConsole,
  checkOperatorSession,
  operatorSessionEndsAt,
  type OperatorSessionCheck,
} from "@shareride/domain";
import { and, eq, isNull } from "drizzle-orm";
import { hashToken, newToken } from "../../platform/crypto.ts";

const { operatorSessions, users } = schema;

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

export type OperatorSessionEndReason =
  "signed_out" | "idle" | "expired" | "role_removed" | "suspended";

export interface StartedOperatorSession {
  /** Goes to the browser in the session cookie only; never stored. */
  readonly token: string;
  readonly sessionId: string;
  readonly endsAt: Date;
}

export interface AuthenticatedOperator {
  readonly userId: string;
  readonly sessionId: string;
  /** When the session ends unless it is used again before then. */
  readonly sessionEndsAt: Date;
}

export interface OperatorSessionService {
  /** Signs an operator in to the console (after a passkey, ADR 0028). */
  start(
    input: { userId: string; device: string | null },
    tx?: Executor,
  ): Promise<StartedOperatorSession>;
  /**
   * The operator behind a session token, or null. A session that has gone
   * idle, passed 12 hours, or whose account lost the role or was suspended
   * is ended here and never works again.
   */
  authenticate(token: string): Promise<AuthenticatedOperator | null>;
  /** Ends one session; pass the transaction that records why, if there is one. */
  end(sessionId: string, reason: OperatorSessionEndReason, tx?: Executor): Promise<void>;
  /** Ends every console session of an account, for example when its role is removed. */
  endAllOf(userId: string, reason: OperatorSessionEndReason, tx?: Executor): Promise<number>;
}

export interface OperatorSessionDependencies {
  readonly db: Database;
  readonly clock: () => Date;
}

const endReasons: Record<Exclude<OperatorSessionCheck, "live">, OperatorSessionEndReason | null> = {
  ended: null,
  idle: "idle",
  expired: "expired",
};

export function createOperatorSessionService(
  dependencies: OperatorSessionDependencies,
): OperatorSessionService {
  const { db, clock } = dependencies;

  async function end(
    sessionId: string,
    reason: OperatorSessionEndReason,
    tx: Executor = db,
  ): Promise<void> {
    await tx
      .update(operatorSessions)
      .set({ endedAt: clock(), endReason: reason })
      .where(and(eq(operatorSessions.id, sessionId), isNull(operatorSessions.endedAt)));
  }

  return {
    async start({ userId, device }, tx = db) {
      const token = newToken("operatorSession");
      const now = clock();
      const [row] = await tx
        .insert(operatorSessions)
        .values({
          userId,
          tokenHash: hashToken(token),
          device: device === null ? null : device.slice(0, 120),
          lastUsedAt: now,
          confirmedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: operatorSessions.id });
      if (row === undefined) throw new Error("The console session was not saved.");
      return {
        token,
        sessionId: row.id,
        endsAt: operatorSessionEndsAt({ startedAt: now, lastUsedAt: now }),
      };
    },

    async authenticate(token) {
      const [row] = await db
        .select({
          sessionId: operatorSessions.id,
          userId: operatorSessions.userId,
          startedAt: operatorSessions.createdAt,
          lastUsedAt: operatorSessions.lastUsedAt,
          endedAt: operatorSessions.endedAt,
          roles: users.roles,
          status: users.status,
        })
        .from(operatorSessions)
        .innerJoin(users, eq(users.id, operatorSessions.userId))
        .where(eq(operatorSessions.tokenHash, hashToken(token)));
      if (row === undefined) return null;
      const now = clock();
      const check = checkOperatorSession(row, now);
      if (check !== "live") {
        const reason = endReasons[check];
        if (reason !== null) await end(row.sessionId, reason);
        return null;
      }
      if (!canUseConsole(row)) {
        await end(row.sessionId, row.status === "active" ? "role_removed" : "suspended");
        return null;
      }
      await db
        .update(operatorSessions)
        .set({ lastUsedAt: now })
        .where(eq(operatorSessions.id, row.sessionId));
      return {
        userId: row.userId,
        sessionId: row.sessionId,
        sessionEndsAt: operatorSessionEndsAt({ startedAt: row.startedAt, lastUsedAt: now }),
      };
    },

    end,

    async endAllOf(userId, reason, tx = db) {
      const ended = await tx
        .update(operatorSessions)
        .set({ endedAt: clock(), endReason: reason })
        .where(and(eq(operatorSessions.userId, userId), isNull(operatorSessions.endedAt)))
        .returning({ id: operatorSessions.id });
      return ended.length;
    },
  };
}
