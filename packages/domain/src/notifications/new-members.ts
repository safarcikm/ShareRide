// The operator's email about new members (spec 25): when one may go, and
// which members it covers. Counting them is the worker's.

/** The least time between two emails about new members to one operator (R25.3). */
export const newMembersEmailGapMinutes = 60;

const minuteMs = 60_000;

/**
 * Whether an email about new members may go to the operator now, and from
 * when it counts (R25.3): from the later of the moment they turned it on and
 * their last such email, so two emails never count one member twice. Null
 * within the hour after the last email: anyone new waits for the next one.
 */
export function newMembersPeriod(input: {
  /** When the operator turned the email on. */
  readonly onSince: Date;
  /** When their last email about new members was made, or null before the first. */
  readonly lastEmailAt: Date | null;
  readonly now: Date;
}): { readonly from: Date } | null {
  const { onSince, lastEmailAt, now } = input;
  if (lastEmailAt === null) return { from: onSince };
  if (now.getTime() - lastEmailAt.getTime() < newMembersEmailGapMinutes * minuteMs) return null;
  return { from: lastEmailAt > onSince ? lastEmailAt : onSince };
}
