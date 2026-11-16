// Who may use the operator console, and how long a console session lasts
// (spec 10, 3.1; ADR 0028).

/** The role that opens the console. Only the server's `operator` command gives it. */
export const operatorRole = "operator";

/**
 * Console sessions end 30 minutes after their last use and 12 hours after
 * sign-in, whichever comes first; a passkey signs the operator in again in
 * a moment. Ended sessions are deleted after 30 days, like the app's.
 */
export const operatorSessionRules = {
  idleSeconds: 30 * 60,
  maxSeconds: 12 * 3600,
  endedSessionRetentionDays: 30,
} as const;

export interface ConsoleAccount {
  readonly roles: readonly string[];
  readonly status: string;
}

/** True for an active account that holds the operator role. */
export function canUseConsole(account: ConsoleAccount): boolean {
  return account.status === "active" && account.roles.includes(operatorRole);
}

export interface OperatorSessionTimes {
  readonly startedAt: Date;
  readonly lastUsedAt: Date;
}

export interface OperatorSessionState extends OperatorSessionTimes {
  readonly endedAt: Date | null;
}

export type OperatorSessionCheck = "live" | "ended" | "idle" | "expired";

/** When the session stops working unless it is used again before then. */
export function operatorSessionEndsAt(session: OperatorSessionTimes): Date {
  const idle = session.lastUsedAt.getTime() + operatorSessionRules.idleSeconds * 1000;
  const max = session.startedAt.getTime() + operatorSessionRules.maxSeconds * 1000;
  return new Date(Math.min(idle, max));
}

/** Whether a console session still works now, and if not, why. */
export function checkOperatorSession(
  session: OperatorSessionState,
  now: Date,
): OperatorSessionCheck {
  if (session.endedAt !== null) return "ended";
  const max = session.startedAt.getTime() + operatorSessionRules.maxSeconds * 1000;
  if (now.getTime() >= max) return "expired";
  return now.getTime() >= operatorSessionEndsAt(session).getTime() ? "idle" : "live";
}
