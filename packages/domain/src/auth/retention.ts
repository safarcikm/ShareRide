import { sessionRules } from "./session-tokens.ts";

/**
 * How long sign-in records are kept (privacy inventory in
 * docs/compliance/privacy-gdpr.md). A scheduled clean-up deletes them.
 */
export const retention = {
  /** Limits look back at most a day, so a day's events are enough. */
  rateLimitEventsSeconds: 24 * 3600,
  /** Ended sessions stay visible in the device list for a while. */
  endedSessionsSeconds: 30 * 24 * 3600,
} as const;

export interface RetentionCutoffs {
  /** Codes that expired before this time are deleted. */
  readonly codesExpiredBefore: Date;
  readonly rateLimitEventsBefore: Date;
  /** Access and refresh tokens that expired before this time are deleted. */
  readonly tokensExpiredBefore: Date;
  /** Open sessions not used since this time are ended. */
  readonly sessionsIdleSince: Date;
  /** Sessions that ended before this time are deleted. */
  readonly sessionsEndedBefore: Date;
}

export function retentionCutoffs(now: Date): RetentionCutoffs {
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);
  return {
    codesExpiredBefore: now,
    rateLimitEventsBefore: ago(retention.rateLimitEventsSeconds),
    tokensExpiredBefore: now,
    sessionsIdleSince: ago(sessionRules.refreshTokenIdleSeconds),
    sessionsEndedBefore: ago(retention.endedSessionsSeconds),
  };
}
