// The audit log's entries (spec 9, 3.8; R9.7, R10.8).

import { fromIceland } from "../time.ts";

const actionPattern = /^[a-z][a-z_]*(\.[a-z][a-z_]*)+$/;

/**
 * An action is a dotted name of lower-case words, the record's kind first
 * and what happened last: `meeting_point.activated`, `operator.signed_in`.
 */
export function isAuditAction(action: string): boolean {
  return actionPattern.test(action);
}

export type AuditValues = Readonly<Record<string, unknown>>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The fields of a record that an action changed, before and after, so an
 * entry holds the change and not a copy of the whole record. A field on
 * one side only is null on the other.
 */
export function changedFields(
  before: AuditValues,
  after: AuditValues,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const changed = { before: {} as Record<string, unknown>, after: {} as Record<string, unknown> };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const old = before[key] ?? null;
    const now = after[key] ?? null;
    if (same(old, now)) continue;
    changed.before[key] = old;
    changed.after[key] = now;
  }
  return changed;
}

/** Entries per page of the console's audit log. */
export const auditLogPageSize = 50;

const icelandMidnight = (date: string, addDays = 0): Date => {
  const [year = 0, month = 0, day = 0] = date.split("-").map(Number);
  return fromIceland({ year, month, day: day + addDays, hour: 0, minute: 0 });
};

/**
 * The moments a filter by calendar days covers: from the start of the
 * first day in Iceland until the start of the day after the last, so the
 * last day counts whole. A side left out stays open.
 */
export function auditLogPeriod(days: { readonly from?: string; readonly to?: string }): {
  from?: Date;
  until?: Date;
} {
  return {
    ...(days.from === undefined ? {} : { from: icelandMidnight(days.from) }),
    ...(days.to === undefined ? {} : { until: icelandMidnight(days.to, 1) }),
  };
}
