// Spec 11's values, and the periods of the privacy register
// (docs/compliance/privacy-gdpr.md) that this feature enforces. Periods
// marked "verify" in the register go to the lawyer; changing one here
// changes the clean-up and nothing else.

export const privacySettings = {
  /** An export can be downloaded for 7 days, then it is deleted (R11.2). */
  exportValidDays: 7,
  /** One export per 24 hours (spec 11, 3.2). */
  exportEveryHours: 24,
  /** After an export's file is deleted, its dates are kept this long, to show it expired. */
  exportRecordsKeptDays: 30,
  /** A one-time download link works this long. */
  exportLinkSeconds: 120,
  /** Data is erased 7 days after deletion is asked for, unless undone (R11.8, decision 1). */
  deletionWaitDays: 7,
  /** A suspended person's number hash is kept at most this long (R11.9, decision 2). */
  blockedNumberMaxYears: 3,
  /** Longer than the 7 days of point-in-time recovery, so a restore can erase again (3.7.4). */
  erasedAccountsKeptDays: 30,
  /** The GDPR's deadline for an answer (R11.7). */
  requestDueMonths: 1,
  requestTextMaxLength: 2000,
  /** The operator's answer, sent by email. */
  requestAnswerMaxLength: 5000,
  /** Requests one person can send in 24 hours, so the form cannot flood the operator. */
  requestsPerDay: 5,
  /** Trips and bookings are anonymised this long after the trip (register: verify). */
  tripsKeptYears: 3,
  /** Privacy requests are deleted this long after the answer (register: verify). */
  requestsKeptYears: 3,
  /** How long the record of each clean-up run is kept. */
  retentionRunsKeptDays: 90,
  /** An ended hold is kept this long, like the audit entries that record it (spec 9, 3.8). */
  holdsKeptYears: 3,
} as const;
