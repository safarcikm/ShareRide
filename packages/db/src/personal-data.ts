import type { ExportSection, PersonalDataCategory } from "@shareride/domain";

/**
 * What each table holds about a person, which part of "Download my data" it
 * feeds, which columns point at a person, and what account deletion does to
 * its rows (spec 11, 3.5; privacy self-service plan, 4.2 and 4.6). The kind
 * of data sums it up (`deletionEffects` in the domain); this says it column
 * by column. A test fails until every table, every column pointing at a
 * person and every text column of a kept row is listed here, so a new table
 * or column never escapes export or erasure. Keep it in step with the record
 * of processing in docs/compliance/privacy-gdpr.md.
 */
export interface TablePrivacy {
  /** The kind of personal data, or null when the table holds nothing linked to a person. */
  readonly category: PersonalDataCategory | null;
  /** The export section the table feeds, or why it is left out. */
  readonly export: { readonly section: ExportSection } | { readonly leftOut: string };
  /** Columns that hold a person's ID, by their names in the schema, with or without a foreign key. */
  readonly personColumns: readonly string[];
  /**
   * What erasing an account does to the person's rows: `erase` deletes them;
   * `keep` keeps them for the other people, linked to the shared former
   * member, with the `emptied` columns cleared and the `kept` ones as they
   * are; `leave` leaves them exactly as they are, the erased ID pointing at
   * nothing. Null when the table holds nothing linked to a person. The
   * erasure (apps/api/src/modules/privacy/erasure.ts) follows this.
   */
  readonly onDeletion: Deletion | null;
  /** UUID columns that are not a person and point nowhere, such as a retry key. */
  readonly otherIds?: readonly string[];
}

export type Deletion =
  | { readonly rows: "erase"; readonly note?: string }
  | { readonly rows: "leave"; readonly note: string }
  | {
      readonly rows: "keep";
      readonly emptied: readonly string[];
      readonly kept: readonly string[];
      readonly note?: string;
    };

const notAboutAPerson = (leftOut: string): TablePrivacy => ({
  category: null,
  export: { leftOut },
  personColumns: [],
  onDeletion: null,
});

const erase = { rows: "erase" } as const;
const keep = (kept: readonly string[], emptied: readonly string[] = [], note?: string) =>
  ({ rows: "keep", kept, emptied, ...(note === undefined ? {} : { note }) }) as const;

export const personalData: Readonly<Record<string, TablePrivacy>> = {
  users: {
    category: "account",
    export: { section: "account" },
    personColumns: [],
    onDeletion: { rows: "erase", note: "the row itself; what is kept moves to the former member" },
  },
  verification_codes: notAboutAPerson(
    "keyed hashes of a number and a code, not linked to an account and gone within minutes",
  ),
  rate_limit_events: notAboutAPerson(
    "keyed hashes of numbers and network addresses, not linked to an account, kept 24 hours",
  ),
  sessions: {
    category: "devices",
    export: { section: "devices" },
    personColumns: ["userId"],
    onDeletion: erase,
  },
  session_tokens: {
    category: "devices",
    export: { leftOut: "token hashes only; the devices come from sessions" },
    personColumns: [],
    onDeletion: erase,
  },
  email_verifications: {
    category: "account",
    export: { section: "email_waiting" },
    personColumns: ["userId"],
    onDeletion: erase,
  },
  legal_documents: notAboutAPerson("the documents themselves, the same for everyone"),
  legal_acceptances: {
    category: "consents",
    export: { section: "legal_acceptances" },
    personColumns: ["userId"],
    onDeletion: erase,
  },
  notification_preferences: {
    category: "consents",
    export: { section: "settings" },
    personColumns: ["userId"],
    onDeletion: erase,
  },
  push_tokens: {
    category: "devices",
    export: { section: "devices" },
    personColumns: ["userId"],
    onDeletion: erase,
  },
  push_tickets: {
    category: "devices",
    export: { leftOut: "the push service's receipt for one push, kept at most 24 hours" },
    personColumns: [],
    onDeletion: erase,
  },
  vehicles: {
    category: "vehicles",
    export: { section: "vehicles" },
    personColumns: ["ownerId"],
    onDeletion: keep(
      ["make", "model", "colour"],
      ["registration"],
      "only cars a published trip used are kept, for that trip; the rest are deleted",
    ),
  },
  meeting_points: notAboutAPerson("public places chosen by the operator"),
  places: notAboutAPerson("public place names"),
  legs: notAboutAPerson("driving distances between meeting points"),
  trips: {
    category: "trips_and_bookings",
    export: { section: "trips_posted" },
    personColumns: ["driverId"],
    onDeletion: keep(
      ["status", "bookingMode", "luggage", "pets", "smoking", "chat", "cancelReason"],
      ["note", "cancelNote"],
      "drafts are deleted, and trips not yet departed are cancelled first",
    ),
  },
  trip_stops: {
    category: "trips_and_bookings",
    export: { section: "trips_posted" },
    personColumns: [],
    onDeletion: keep([]),
  },
  segments: {
    category: "trips_and_bookings",
    export: { section: "trips_posted" },
    personColumns: [],
    onDeletion: keep(["currency"]),
  },
  trip_changes: {
    category: "trips_and_bookings",
    export: { section: "trips_posted" },
    personColumns: [],
    // The values hold times, seats, prices, a car's make, model and colour,
    // and stops; for the note, only whether it changed (privacy register).
    onDeletion: keep(["kind", "before", "after"]),
  },
  bookings: {
    category: "trips_and_bookings",
    export: { section: "bookings" },
    personColumns: ["passengerId"],
    onDeletion: keep(
      ["status", "currency", "declineReason", "cancelledBy", "cancelReason"],
      ["message", "cancelNote"],
    ),
    otherIds: ["attemptKey"],
  },
  check_ins: {
    category: "trips_and_bookings",
    export: { section: "bookings" },
    personColumns: ["userId"],
    // "I'm here" times, a time only, matter to the other side if they disagree
    // (spec 8, 3.5). A driver's own are exported with their trip's stops.
    onDeletion: keep([]),
  },
  disputes: {
    category: "trips_and_bookings",
    export: { section: "bookings" },
    personColumns: [],
    // What was reported and how it ended decide a refund and reliability
    // for the other side too (spec 8, 3.5). The notes were for the
    // operator, and go. Each side's export has its own note only: a
    // passenger's with their booking, a driver's with the trip's passengers.
    onDeletion: keep(
      ["kind", "answer", "outcome", "decidedBy"],
      ["note", "answerNote", "decisionNote"],
    ),
  },
  booking_segment_prices: {
    category: "trips_and_bookings",
    export: { section: "bookings" },
    personColumns: [],
    onDeletion: keep([]),
  },
  payments: {
    category: "payments",
    export: { section: "payments" },
    personColumns: [],
    onDeletion: keep(["provider", "providerRef", "currency", "status"]),
  },
  conversations: {
    category: "messages",
    export: { section: "conversations" },
    personColumns: [],
    onDeletion: keep([]),
  },
  messages: {
    category: "messages",
    export: { section: "conversations" },
    personColumns: ["senderId"],
    // The other person sees "Message deleted".
    onDeletion: keep(["kind"], ["body", "key", "params"]),
    otherIds: ["clientId"],
  },
  erased_accounts: notAboutAPerson(
    "the former IDs of erased accounts, kept 30 days to erase them again after a restore",
  ),
  blocked_numbers: notAboutAPerson(
    "keyed hashes of the numbers of erased suspended accounts, linked to no account",
  ),
  retention_runs: notAboutAPerson("how many records each clean-up rule erased, never which"),
  holds: {
    category: "audit",
    export: {
      leftOut:
        "the operator's records of what is kept for a dispute or claim; asked about through Ask about my data",
    },
    personColumns: ["subjectId", "setBy"],
    onDeletion: {
      rows: "leave",
      note: "an account is not erased while a hold covers it; an ended hold keeps the IDs, and goes 3 years after its end",
    },
  },
  data_exports: {
    category: "exports",
    export: { leftOut: "the exports themselves, kept 7 days" },
    personColumns: ["userId"],
    onDeletion: erase,
  },
  outbox_events: notAboutAPerson("IDs of what happened, kept 7 days once processed"),
  notifications: {
    category: "notification_log",
    export: { section: "notifications" },
    personColumns: ["recipientId"],
    onDeletion: erase,
  },
  notification_deliveries: {
    category: "notification_log",
    export: { section: "notifications" },
    personColumns: [],
    onDeletion: erase,
  },
  scheduled_notifications: {
    category: "notification_log",
    export: { leftOut: "reminders not yet sent, IDs and times only" },
    personColumns: [],
    onDeletion: {
      rows: "erase",
      note: "reminders of the person's trips and bookings, all cancelled or over by then",
    },
  },
  operator_sessions: {
    category: "devices",
    export: { leftOut: "the operator's own console sign-ins, deleted 30 days after they end" },
    personColumns: ["userId"],
    onDeletion: erase,
  },
  operator_passkeys: {
    category: "devices",
    export: { leftOut: "the operator's own passkeys: public keys and names, no secret" },
    personColumns: ["userId"],
    onDeletion: erase,
  },
  operator_setup_links: {
    category: "devices",
    export: { leftOut: "a hash of a link that worked once, for 30 minutes" },
    personColumns: ["userId"],
    onDeletion: erase,
  },
  operator_challenges: {
    category: "devices",
    export: { leftOut: "random challenges for a passkey to sign, good for 5 minutes" },
    personColumns: ["userId"],
    onDeletion: erase,
  },
  audit_log: {
    category: "audit",
    export: { leftOut: "operator actions, kept 3 years for accountability (spec 9, 3.8)" },
    personColumns: ["operatorUserId"],
    onDeletion: {
      rows: "leave",
      note: "kept as they are: the database refuses changes, and deletes before 3 years",
    },
    otherIds: ["operatorSessionId"],
  },
  blocks: {
    category: "blocks",
    // Only the blocks the person made: who blocked them is never shown (R9.4).
    export: { section: "blocks" },
    personColumns: ["blockerId", "blockedId"],
    onDeletion: { rows: "erase", note: "blocks made by the person and blocks of them" },
  },
};
