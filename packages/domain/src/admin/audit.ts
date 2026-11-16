// The audit log's entries (spec 9, 3.8; R9.7, R10.8).

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
