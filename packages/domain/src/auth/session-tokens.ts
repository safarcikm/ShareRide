/** Session lifetimes (spec 1, sections 3.7 and 7; ADR 0016). */
export const sessionRules = {
  accessTokenSeconds: 15 * 60,
  refreshTokenIdleSeconds: 60 * 24 * 3600,
  retryGraceSeconds: 30,
  endedSessionRetentionDays: 30,
} as const;

export interface RefreshTokenState {
  readonly expiresAt: Date;
  /** When this token was swapped for a new one; null while it is current. */
  readonly rotatedAt: Date | null;
  /** True when the token that replaced this one is still the current one. */
  readonly replacementIsCurrent: boolean;
  readonly sessionEnded: boolean;
}

export type RefreshDecision =
  /** Issue new tokens and retire this one. */
  | "rotate"
  /** A retry after a lost reply: replace the replacement with new tokens. */
  | "retry"
  /** An old token came back: it may be stolen, so end the session. */
  | "reuse_detected"
  | "expired"
  | "session_ended";

/** What to do with a refresh token that was presented now. */
export function decideRefresh(token: RefreshTokenState, now: Date): RefreshDecision {
  if (token.sessionEnded) return "session_ended";
  if (token.rotatedAt === null) {
    return now.getTime() >= token.expiresAt.getTime() ? "expired" : "rotate";
  }
  const sinceRotation = (now.getTime() - token.rotatedAt.getTime()) / 1000;
  return token.replacementIsCurrent && sinceRotation <= sessionRules.retryGraceSeconds
    ? "retry"
    : "reuse_detected";
}
