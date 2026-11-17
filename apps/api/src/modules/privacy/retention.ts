import { schema, type Database } from "@shareride/db";
import {
  meetingPointIssuesResolvedBy,
  privacyCutoffs,
  type RetentionRule,
} from "@shareride/domain";
import { and, asc, desc, eq, lt, lte, sql } from "drizzle-orm";
import type { Logger } from "../../logger.ts";
import { cleanUpOperatorSessions, cleanUpOperatorSignIn } from "../admin/clean-up.ts";
import { cleanUpSignInRecords } from "../auth/clean-up.ts";
import { cleanUpConversations } from "../chat/clean-up.ts";
import { cleanUpNotifications } from "../notifications/clean-up.ts";
import { cleanUpDrafts } from "../trips/clean-up.ts";
import type { Erasure } from "./erasure.ts";
import { cleanUpExports } from "./exports.ts";
import { notHeld } from "./holds.ts";
import { anonymiseOldTrips } from "./old-trips.ts";

const {
  blockedNumbers,
  erasedAccounts,
  holds,
  meetingPointIssues,
  privacyRequests,
  retentionRuns,
} = schema;

// The hourly clean-up's retention rules (spec 11, 3.7; R11.5; plan 4.7):
// each step runs one or more rules, and each rule it ran is recorded with
// how many records it erased or made anonymous, never which. A step that
// fails records nothing, is reported, and leaves the others to run; the
// next hour tries it again.

export interface RuleCounts {
  readonly erased: number;
  readonly anonymised: number;
}

export interface RetentionStep {
  readonly rules: readonly RetentionRule[];
  /**
   * Runs the rules: a count of erased records per rule, or both counts. A
   * rule left out counted none. `failures` are records it could not handle,
   * such as an account erasure that failed, each logged where it failed.
   */
  readonly run: (now: Date) => Promise<{
    readonly counts: Partial<Record<RetentionRule, number | RuleCounts>>;
    readonly failures?: number;
  }>;
}

export interface RetentionResult {
  readonly counts: Partial<Record<RetentionRule, RuleCounts>>;
  /** Rules whose step failed: no run is recorded for them. */
  readonly failedRules: readonly RetentionRule[];
  readonly errors: readonly { readonly rules: readonly RetentionRule[]; readonly error: unknown }[];
  /** Records the steps could not handle, such as accounts that could not be erased. */
  readonly failures: number;
}

/** Runs every step once, at `now`, and records a run for each rule that ran. */
export async function runRetention({
  db,
  now,
  steps,
  logger,
}: {
  readonly db: Database;
  readonly now: Date;
  readonly steps: readonly RetentionStep[];
  readonly logger: Logger;
}): Promise<RetentionResult> {
  const counts: Partial<Record<RetentionRule, RuleCounts>> = {};
  const failedRules: RetentionRule[] = [];
  const errors: { rules: readonly RetentionRule[]; error: unknown }[] = [];
  let failures = 0;
  for (const step of steps) {
    try {
      const result = await step.run(now);
      const rows = step.rules.map((rule) => {
        const counted = result.counts[rule] ?? 0;
        return {
          rule,
          ranAt: now,
          ...(typeof counted === "number" ? { erased: counted, anonymised: 0 } : counted),
        };
      });
      await db.insert(retentionRuns).values(rows);
      for (const { rule, erased, anonymised } of rows) counts[rule] = { erased, anonymised };
      failures += result.failures ?? 0;
    } catch (error) {
      logger.error({ err: error, rules: step.rules }, "retention rule failed");
      failedRules.push(...step.rules);
      errors.push({ rules: step.rules, error });
    }
  }
  return { counts, failedRules, errors, failures };
}

const deleted = (rows: readonly unknown[]) => rows.length;

/**
 * Every rule of `retentionRules`, each in one step, in the order the hourly
 * clean-up runs them. Accounts come last, so a failing erasure never holds
 * up the others.
 */
export function retentionSteps({
  db,
  erasure,
  logger,
}: {
  readonly db: Database;
  readonly erasure: Pick<Erasure, "eraseDue">;
  readonly logger: Logger;
}): RetentionStep[] {
  return [
    {
      rules: [
        "sign_in_codes",
        "rate_limit_events",
        "session_tokens",
        "idle_sessions",
        "ended_sessions",
        "email_links",
      ],
      async run(now) {
        const counts = await cleanUpSignInRecords(db, now);
        return {
          counts: {
            sign_in_codes: counts.codes,
            rate_limit_events: counts.rateLimitEvents,
            session_tokens: counts.tokens,
            // Ended, with their tokens and push tokens: counted once each.
            idle_sessions: counts.sessionsEnded,
            ended_sessions: counts.sessionsDeleted,
            email_links: counts.emailLinks,
          },
        };
      },
    },
    {
      rules: ["trip_drafts"],
      run: async (now) => ({ counts: { trip_drafts: await cleanUpDrafts(db, now) } }),
    },
    {
      rules: ["conversations"],
      run: async (now) => ({ counts: { conversations: await cleanUpConversations(db, now) } }),
    },
    {
      rules: ["trips_and_bookings"],
      async run(now) {
        const counts = await anonymiseOldTrips(db, now, logger);
        return {
          counts: {
            trips_and_bookings: {
              erased: counts.cars,
              anonymised: counts.trips + counts.bookings,
            },
          },
          failures: counts.failed,
        };
      },
    },
    {
      rules: ["notification_log", "scheduled_notifications", "outbox_events"],
      async run(now) {
        const counts = await cleanUpNotifications(db, now);
        return {
          counts: {
            notification_log: counts.notifications,
            scheduled_notifications: counts.schedules,
            outbox_events: counts.events,
          },
        };
      },
    },
    {
      rules: ["operator_sessions"],
      run: async (now) => ({
        counts: { operator_sessions: await cleanUpOperatorSessions(db, now) },
      }),
    },
    {
      rules: ["operator_sign_in"],
      run: async (now) => ({ counts: { operator_sign_in: await cleanUpOperatorSignIn(db, now) } }),
    },
    {
      rules: ["data_exports"],
      async run(now) {
        const counts = await cleanUpExports(db, now);
        // A file deleted, then its dates 30 days later: each counts.
        return { counts: { data_exports: counts.exportFiles + counts.exportRecords } };
      },
    },
    {
      rules: ["blocked_numbers"],
      async run(now) {
        const rows = await db
          .delete(blockedNumbers)
          .where(lte(blockedNumbers.until, privacyCutoffs(now).blockedNumbersUntil))
          .returning({ phoneHash: blockedNumbers.phoneHash });
        return { counts: { blocked_numbers: deleted(rows) } };
      },
    },
    {
      rules: ["erased_accounts"],
      async run(now) {
        const rows = await db
          .delete(erasedAccounts)
          .where(lt(erasedAccounts.erasedAt, privacyCutoffs(now).erasedAccountsBefore))
          .returning({ userId: erasedAccounts.userId });
        return { counts: { erased_accounts: deleted(rows) } };
      },
    },
    {
      rules: ["privacy_requests"],
      async run(now) {
        // An unanswered request stays until it is answered.
        const rows = await db
          .delete(privacyRequests)
          .where(
            and(
              lte(privacyRequests.answeredAt, privacyCutoffs(now).requestsAnsweredBy),
              notHeld(db, now, [["user", privacyRequests.userId]]),
            ),
          )
          .returning({ id: privacyRequests.id });
        return { counts: { privacy_requests: deleted(rows) } };
      },
    },
    {
      rules: ["meeting_point_issues"],
      async run(now) {
        // Resolved reports are no longer linked to anyone, so no hold applies.
        const rows = await db
          .delete(meetingPointIssues)
          .where(
            and(
              eq(meetingPointIssues.status, "resolved"),
              lte(meetingPointIssues.resolvedAt, meetingPointIssuesResolvedBy(now)),
            ),
          )
          .returning({ id: meetingPointIssues.id });
        return { counts: { meeting_point_issues: deleted(rows) } };
      },
    },
    {
      rules: ["holds"],
      async run(now) {
        // Ended early, or run to their end.
        const rows = await db
          .delete(holds)
          .where(
            lte(
              sql`coalesce(${holds.endedAt}, ${holds.endsAt})`,
              privacyCutoffs(now).holdsEndedBefore,
            ),
          )
          .returning({ id: holds.id });
        return { counts: { holds: deleted(rows) } };
      },
    },
    {
      rules: ["retention_runs"],
      async run(now) {
        const rows = await db
          .delete(retentionRuns)
          .where(lt(retentionRuns.ranAt, privacyCutoffs(now).retentionRunsBefore))
          .returning({ id: retentionRuns.id });
        return { counts: { retention_runs: deleted(rows) } };
      },
    },
    {
      rules: ["accounts"],
      async run() {
        const { erased, failed } = await erasure.eraseDue();
        return { counts: { accounts: erased }, failures: failed };
      },
    },
  ];
}

export interface LastRun extends RuleCounts {
  readonly rule: string;
  readonly ranAt: Date;
}

/** The last recorded run of each rule, by rule name; a rule never run is missing. */
export async function lastRuns(db: Database): Promise<readonly LastRun[]> {
  return db
    .selectDistinctOn([retentionRuns.rule], {
      rule: retentionRuns.rule,
      ranAt: retentionRuns.ranAt,
      erased: retentionRuns.erased,
      anonymised: retentionRuns.anonymised,
    })
    .from(retentionRuns)
    .orderBy(asc(retentionRuns.rule), desc(retentionRuns.ranAt));
}
