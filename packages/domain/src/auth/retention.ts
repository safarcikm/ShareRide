import { emailLinkRules } from "./email-address.ts";
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
  /** A Google or Apple sign-in stays an hour after it ended (spec 19, 7). */
  providerSignInsSeconds: 3600,
  /** An email sign-in waiting for its phone step stays an hour after it expired (spec 26, 4). */
  emailSignInsSeconds: 3600,
  /** A member's passkey challenge stays an hour after it expired (spec 27, 5). */
  passkeyChallengesSeconds: 3600,
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
  /**
   * Links to verify an email sent before this time are deleted: they no
   * longer work, and the send limits look back no further.
   */
  readonly emailLinksSentBefore: Date;
  /** Google and Apple sign-ins that ended before this time are deleted. */
  readonly providerSignInsExpiredBefore: Date;
  /** Email sign-ins that stopped waiting before this time are deleted. */
  readonly emailSignInsExpiredBefore: Date;
  /** Members' passkey challenges that expired before this time are deleted. */
  readonly passkeyChallengesExpiredBefore: Date;
}

export function retentionCutoffs(now: Date): RetentionCutoffs {
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);
  return {
    codesExpiredBefore: now,
    rateLimitEventsBefore: ago(retention.rateLimitEventsSeconds),
    tokensExpiredBefore: now,
    sessionsIdleSince: ago(sessionRules.refreshTokenIdleSeconds),
    sessionsEndedBefore: ago(retention.endedSessionsSeconds),
    emailLinksSentBefore: ago(emailLinkRules.validForSeconds),
    providerSignInsExpiredBefore: ago(retention.providerSignInsSeconds),
    emailSignInsExpiredBefore: ago(retention.emailSignInsSeconds),
    passkeyChallengesExpiredBefore: ago(retention.passkeyChallengesSeconds),
  };
}
