import { notificationRetention } from "./delivery.ts";

// The operator's email about new members (spec 25): when one may go, and
// which members it covers. Counting them is the worker's.

/** The least time between two emails about new members to one operator (R25.3). */
export const newMembersEmailGapMinutes = 60;

/**
 * How far back an email about new members counts at most: a day less than
 * the notification log keeps the emails, so whenever someone joined in that
 * time, the email that counted them is still there to count from.
 */
export const newMembersLookbackDays = notificationRetention.logDays - 1;

const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;

const latest = (...moments: readonly Date[]): Date =>
  new Date(Math.max(...moments.map((moment) => moment.getTime())));

/**
 * Where an email about new members made at `until` starts counting
 * (R25.3): the later of the moment the operator turned it on and their last
 * such email, so two emails never count one member twice; never further
 * back than `newMembersLookbackDays`, as older emails leave the log.
 */
export function newMembersFrom(input: {
  readonly onSince: Date;
  readonly lastEmailAt: Date | null;
  readonly until: Date;
}): Date {
  const { onSince, lastEmailAt, until } = input;
  const floor = new Date(until.getTime() - newMembersLookbackDays * dayMs);
  return latest(onSince, floor, ...(lastEmailAt === null ? [] : [lastEmailAt]));
}

/**
 * Whether an email about new members may go to the operator now, and from
 * when it counts (`newMembersFrom`). Null within the hour after the last
 * email: anyone new waits for the next one.
 */
export function newMembersPeriod(input: {
  /** When the operator turned the email on. */
  readonly onSince: Date;
  /** When their last email about new members was made, or null before the first. */
  readonly lastEmailAt: Date | null;
  readonly now: Date;
}): { readonly from: Date } | null {
  const { onSince, lastEmailAt, now } = input;
  if (
    lastEmailAt !== null &&
    now.getTime() - lastEmailAt.getTime() < newMembersEmailGapMinutes * minuteMs
  ) {
    return null;
  }
  return { from: newMembersFrom({ onSince, lastEmailAt, until: now }) };
}
