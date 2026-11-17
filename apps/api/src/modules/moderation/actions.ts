import { schema, type Database } from "@shareride/db";
import {
  checkAppealAnswer,
  checkReinstatement,
  checkStatement,
  checkSuspension,
  defaultSafetySettings,
  err,
  isSuspended,
  ok,
  suspensionEffects,
  type AppealAnswerProblem,
  type AppealOutcome,
  type BookingStatus,
  type HideableContent,
  type ModerationRule,
  type ReportOutcome,
  type Result,
  type SafetySettings,
  type StatementProblem,
  type SuspensionProblem,
  type TripStatus,
} from "@shareride/domain";
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { recordAudit, type AuditRequest } from "../admin/audit.ts";
import {
  cancelBookingAsOperator,
  cancelTripAsOperator,
  heldStatuses,
} from "../bookings/cancel-trip.ts";
import type { Transaction } from "../bookings/seats.ts";
import { recordEvents } from "../notifications/outbox.ts";

// The operator's actions on a person (spec 9, 3.4.3 and 3.6): each one in
// one transaction with its audit entry (R9.7) and the person's notice, the
// statement of reasons (R9.5). The console calls them (milestone 9, PRs 7
// and 8). An audit entry holds IDs and the names of the fields that
// changed, never their values: the action's own row holds what was done
// and why (spec 9, section 7; privacy register, "Audit log").

const { bookings, messages, moderationActions, reports, trips, tripStops, users } = schema;

/** Who acts: an operator, with their console session (none from a command). */
export interface Moderator {
  readonly userId: string;
  readonly sessionId: string | null;
}

type NotFound = { readonly code: "not_found" };

export type SuspendError = NotFound | { readonly code: "already_suspended" } | SuspensionProblem;
export type WarnError = NotFound | StatementProblem;
export type ReinstateError = NotFound | { readonly code: "not_suspended" } | StatementProblem;
export type AnswerAppealError = NotFound | AppealAnswerProblem;
export type HideContentError = NotFound | { readonly code: "already_hidden" } | StatementProblem;
export type CancelTripError =
  NotFound | { readonly code: "already_cancelled" | "trip_not_cancellable" } | StatementProblem;

/** What the operator can hide today; a review joins when reviews exist (spec 8). */
export const hideableNow = [
  "message",
  "trip_note",
  "about",
] as const satisfies readonly HideableContent[];
export type HideableNow = (typeof hideableNow)[number];

/** A piece of content: a message, a trip's note (by the trip's ID) or About you (by the person's). */
export interface Content {
  readonly kind: HideableNow;
  readonly id: string;
}
export type CloseReportError = NotFound | { readonly code: "already_closed" };

export interface ModerationService {
  /**
   * Suspends the person (3.6.1), until `until` or for good, and cancels at
   * once what a suspension cancels (R9.10). Refused while they are
   * suspended already: reinstate first to change it.
   */
  suspend(
    by: Moderator,
    input: {
      readonly userId: string;
      readonly rule: ModerationRule;
      readonly reason: string;
      readonly until: Date | null;
      readonly reportId?: string;
    },
    request: AuditRequest | null,
  ): Promise<
    Result<
      {
        readonly actionId: string;
        readonly tripsCancelled: number;
        readonly bookingsCancelled: number;
      },
      SuspendError
    >
  >;
  /** Warns the person (3.4.3): nothing else changes. */
  warn(
    by: Moderator,
    input: {
      readonly userId: string;
      readonly rule: ModerationRule;
      readonly reason: string;
      readonly reportId?: string;
    },
    request: AuditRequest | null,
  ): Promise<Result<{ readonly actionId: string }, WarnError>>;
  /** Ends a suspension early, with a note the person reads (3.6.3). */
  reinstate(
    by: Moderator,
    input: { readonly userId: string; readonly note: string },
    request: AuditRequest | null,
  ): Promise<Result<{ readonly actionId: string }, ReinstateError>>;
  /**
   * Answers the person's appeal, once and finally in the app (3.4.4).
   * Reversing the suspension they are under lifts it; what it cancelled
   * stays cancelled.
   */
  answerAppeal(
    by: Moderator,
    input: {
      readonly actionId: string;
      readonly outcome: AppealOutcome;
      readonly answer: string;
    },
    request: AuditRequest | null,
  ): Promise<Result<void, AnswerAppealError>>;
  /**
   * Hides content (3.4.3): a message reads "Removed by ShareRide" to both
   * people; a trip's note and About you are no longer shown to others, until
   * the person writes a new one. Reversing it on appeal shows it again.
   */
  hideContent(
    by: Moderator,
    input: {
      readonly content: Content;
      readonly rule: ModerationRule;
      readonly reason: string;
      readonly reportId?: string;
    },
    request: AuditRequest | null,
  ): Promise<Result<{ readonly actionId: string }, HideContentError>>;
  /**
   * Cancels an upcoming trip as ShareRide (3.4.3): full refunds, the
   * passengers told it was cancelled and never why, and the driver the
   * reason. It counts on the driver's reliability only when the operator
   * says so.
   */
  cancelTrip(
    by: Moderator,
    input: {
      readonly tripId: string;
      readonly rule: ModerationRule;
      readonly reason: string;
      readonly countsOnReliability: boolean;
      readonly reportId?: string;
    },
    request: AuditRequest | null,
  ): Promise<Result<{ readonly actionId: string }, CancelTripError>>;
  /** Closes a report, and tells the reporter the outcome in general terms (3.1.6). */
  closeReport(
    by: Moderator,
    input: { readonly reportId: string; readonly outcome: ReportOutcome },
    request: AuditRequest | null,
  ): Promise<Result<void, CloseReportError>>;
}

/**
 * Locks the person's row as booking, publishing and sending do, so nothing
 * they do runs while an action on them does, and a suspension finishes
 * cancelling before they can add to it. Users first, then trips, as
 * everywhere.
 */
async function lockPerson(tx: Transaction, userId: string) {
  const [row] = await tx
    .select({ status: users.status, suspendedUntil: users.suspendedUntil })
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  return row;
}

/** Who posted the content, if it exists; a line of ShareRide's has no one. */
async function ownerOf(tx: Transaction, content: Content): Promise<string | undefined> {
  switch (content.kind) {
    case "message": {
      const [row] = await tx
        .select({ senderId: messages.senderId })
        .from(messages)
        .where(eq(messages.id, content.id));
      return row?.senderId ?? undefined;
    }
    case "trip_note": {
      const [row] = await tx
        .select({ driverId: trips.driverId })
        .from(trips)
        .where(eq(trips.id, content.id));
      return row?.driverId;
    }
    case "about":
      return content.id;
  }
}

/**
 * A person's message and its copies, locked: one sent to all passengers is
 * stored once in each conversation with the same client ID, and is one
 * message to hide. Empty for a line of ShareRide's.
 */
async function copiesOf(tx: Transaction, messageId: string) {
  const [row] = await tx
    .select({ senderId: messages.senderId, clientId: messages.clientId })
    .from(messages)
    .where(eq(messages.id, messageId));
  if (row === undefined || row.senderId === null || row.clientId === null) return [];
  return tx
    .select({ id: messages.id, hiddenAt: messages.hiddenAt })
    .from(messages)
    .where(and(eq(messages.senderId, row.senderId), eq(messages.clientId, row.clientId)))
    .orderBy(asc(messages.id))
    .for("update");
}

/**
 * Locks the content's row, after its owner's (users first, then trips, as
 * everywhere), and says when it was hidden, with a message's copies in other
 * conversations (`also`); undefined when there is nothing others can read: a
 * line of ShareRide's, a draft's note, an empty text.
 */
async function lockContent(
  tx: Transaction,
  content: Content,
): Promise<{ readonly hiddenAt: Date | null; readonly also: readonly string[] } | undefined> {
  switch (content.kind) {
    case "message": {
      const copies = await copiesOf(tx, content.id);
      const own = copies.find((copy) => copy.id === content.id);
      return own === undefined
        ? undefined
        : {
            hiddenAt: own.hiddenAt,
            also: copies.filter((copy) => copy.id !== content.id).map((copy) => copy.id),
          };
    }
    case "trip_note": {
      const [row] = await tx
        .select({ status: trips.status, note: trips.note, hiddenAt: trips.noteHiddenAt })
        .from(trips)
        .where(eq(trips.id, content.id))
        .for("update");
      return row === undefined || row.status === "draft" || row.note === ""
        ? undefined
        : { hiddenAt: row.hiddenAt, also: [] };
    }
    case "about": {
      // The person's row, locked already as the owner's.
      const [row] = await tx
        .select({ about: users.about, hiddenAt: users.aboutHiddenAt })
        .from(users)
        .where(eq(users.id, content.id));
      return row === undefined || row.about === null || row.about === ""
        ? undefined
        : { hiddenAt: row.hiddenAt, also: [] };
    }
  }
}

/** Hides the content at `at`, or shows it again with null; a message with its copies. */
async function setHidden(
  tx: Transaction,
  content: Content,
  also: readonly string[],
  at: Date | null,
  now: Date,
) {
  switch (content.kind) {
    case "message":
      await tx
        .update(messages)
        .set({ hiddenAt: at, updatedAt: now })
        .where(inArray(messages.id, [content.id, ...also]));
      return;
    case "trip_note":
      await tx
        .update(trips)
        .set({ noteHiddenAt: at, updatedAt: now })
        .where(eq(trips.id, content.id));
      return;
    case "about":
      await tx
        .update(users)
        .set({ aboutHiddenAt: at, updatedAt: now })
        .where(eq(users.id, content.id));
      return;
  }
}

/** Each content's audit entry: the record it is on, and the field that changes. */
const hiding = {
  message: { action: "message.hidden", subjectType: "message", field: "hiddenAt" },
  trip_note: { action: "trip.note_hidden", subjectType: "trip", field: "noteHiddenAt" },
  about: { action: "user.about_hidden", subjectType: "user", field: "aboutHiddenAt" },
} as const satisfies Record<HideableNow, { action: string; subjectType: string; field: string }>;

function isHideableNow(kind: string | null): kind is HideableNow {
  return (hideableNow as readonly (string | null)[]).includes(kind);
}

/**
 * The latest action that hid this content: the one in force, as a new note
 * or About you shows it again and the operator can hide it once more.
 */
async function latestHiding(tx: Transaction, content: Content) {
  const [row] = await tx
    .select({ id: moderationActions.id })
    .from(moderationActions)
    .where(
      and(
        eq(moderationActions.kind, "content_hidden"),
        eq(moderationActions.contentKind, content.kind),
        eq(moderationActions.contentId, content.id),
      ),
    )
    .orderBy(desc(moderationActions.createdAt), desc(moderationActions.id))
    .limit(1);
  return row?.id;
}

async function reportExists(tx: Transaction, reportId: string | undefined) {
  if (reportId === undefined) return true;
  const [row] = await tx.select({ id: reports.id }).from(reports).where(eq(reports.id, reportId));
  return row !== undefined;
}

/**
 * What a suspension cancels (R9.10): their published trips and the bookings
 * they hold; with every trip either touches, to lock first.
 */
async function cancellable(tx: Transaction, userId: string, now: Date) {
  const driven = await tx
    .select({ id: trips.id, status: trips.status, departsAt: trips.departsAt })
    .from(trips)
    .where(and(eq(trips.driverId, userId), eq(trips.status, "published")));
  const booked = await tx
    .select({
      id: bookings.id,
      tripId: bookings.tripId,
      status: bookings.status,
      tripStatus: trips.status,
      plannedAt: tripStops.plannedAt,
      departsAt: trips.departsAt,
      total: bookings.totalPrice,
    })
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .leftJoin(tripStops, eq(tripStops.id, bookings.fromStopId))
    .where(and(eq(bookings.passengerId, userId), inArray(bookings.status, heldStatuses)));
  const effects = suspensionEffects(
    driven.flatMap(({ id, status, departsAt }) =>
      departsAt === null ? [] : [{ id, status: status as TripStatus, departsAt }],
    ),
    booked.flatMap(({ id, status, tripStatus, plannedAt, departsAt, total }) => {
      // When they get in: their stop's own time, or the trip's departure.
      const boardsAt = plannedAt ?? departsAt;
      return boardsAt === null
        ? []
        : [
            {
              id,
              status: status as BookingStatus,
              tripStatus: tripStatus as TripStatus,
              boardsAt,
              total: { amount: total, currency: "ISK" as const },
            },
          ];
    }),
    now,
  );
  const tripIds = new Set(effects.trips);
  for (const { id } of effects.bookings) {
    const tripId = booked.find((row) => row.id === id)?.tripId;
    if (tripId !== undefined) tripIds.add(tripId);
  }
  return { effects, tripIds: [...tripIds].sort() };
}

/**
 * Locks the trips in the order of their IDs, as account deletion does, so
 * two suspensions whose trips cross wait for each other instead of
 * deadlocking. The person's own row is locked already.
 */
async function lockTrips(tx: Transaction, tripIds: readonly string[]) {
  if (tripIds.length === 0) return;
  await tx
    .select({ id: trips.id })
    .from(trips)
    .where(inArray(trips.id, [...tripIds]))
    .orderBy(asc(trips.id))
    .for("update");
}

export function createModerationService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings?: SafetySettings;
}): ModerationService {
  const { db, clock } = dependencies;
  const settings = dependencies.settings ?? defaultSafetySettings;

  async function addAction(
    tx: Transaction,
    values: Omit<typeof moderationActions.$inferInsert, "createdAt" | "updatedAt">,
    now: Date,
  ) {
    const [row] = await tx
      .insert(moderationActions)
      .values({ ...values, createdAt: now, updatedAt: now })
      .returning({ id: moderationActions.id });
    if (row === undefined) throw new Error("The moderation action was not stored.");
    // The person's notice: the statement of reasons (R9.5).
    await recordEvents(tx, [{ type: "ModerationActionTaken", actionId: row.id }], now);
    return row.id;
  }

  return {
    async suspend(by, input, request) {
      const checked = checkSuspension(input, clock(), settings);
      if (!checked.ok) return checked;
      const { rule, reason, until } = checked.value;
      return db.transaction(async (tx) => {
        const person = await lockPerson(tx, input.userId);
        if (
          person === undefined ||
          person.status === "deleted" ||
          !(await reportExists(tx, input.reportId))
        ) {
          return err({ code: "not_found" });
        }
        // After the lock, which may have waited for the person's own action.
        const now = clock();
        const standing = {
          status: person.status === "suspended" ? "suspended" : "active",
          suspendedUntil: person.suspendedUntil,
        } as const;
        if (isSuspended(standing, now)) return err({ code: "already_suspended" });
        await tx
          .update(users)
          .set({ status: "suspended", suspendedUntil: until, updatedAt: now })
          .where(eq(users.id, input.userId));
        const { effects, tripIds } = await cancellable(tx, input.userId, now);
        await lockTrips(tx, tripIds);
        const cancelledTrips: string[] = [];
        for (const tripId of effects.trips) {
          // Not on their reliability: the suspension is the operator's (3.4.3).
          const cancelled = await cancelTripAsOperator(tx, tripId, false, clock);
          if (cancelled.ok && cancelled.value) cancelledTrips.push(tripId);
        }
        const cancelledBookings: string[] = [];
        for (const booking of effects.bookings) {
          if (await cancelBookingAsOperator(tx, booking.id, clock)) {
            cancelledBookings.push(booking.id);
          }
        }
        const actionId = await addAction(
          tx,
          {
            userId: input.userId,
            kind: "suspension",
            reportId: input.reportId ?? null,
            rule,
            reason,
            until,
            operatorId: by.userId,
          },
          now,
        );
        await recordAudit(tx, {
          operator: by,
          action: "user.suspended",
          subjectType: "user",
          subjectId: input.userId,
          after: {
            fields: ["status", "suspendedUntil"],
            moderationActionId: actionId,
            ...(input.reportId === undefined ? {} : { reportId: input.reportId }),
            cancelledTrips,
            cancelledBookings,
          },
          request,
        });
        return ok({
          actionId,
          tripsCancelled: cancelledTrips.length,
          bookingsCancelled: cancelledBookings.length,
        });
      });
    },

    async warn(by, input, request) {
      const checked = checkStatement(input, settings);
      if (!checked.ok) return checked;
      const { rule, reason } = checked.value;
      return db.transaction(async (tx) => {
        const person = await lockPerson(tx, input.userId);
        if (
          person === undefined ||
          person.status === "deleted" ||
          !(await reportExists(tx, input.reportId))
        ) {
          return err({ code: "not_found" });
        }
        const now = clock();
        const actionId = await addAction(
          tx,
          {
            userId: input.userId,
            kind: "warning",
            reportId: input.reportId ?? null,
            rule,
            reason,
            operatorId: by.userId,
          },
          now,
        );
        await recordAudit(tx, {
          operator: by,
          action: "user.warned",
          subjectType: "user",
          subjectId: input.userId,
          after: {
            moderationActionId: actionId,
            ...(input.reportId === undefined ? {} : { reportId: input.reportId }),
          },
          request,
        });
        return ok({ actionId });
      });
    },

    async reinstate(by, input, request) {
      return db.transaction(async (tx) => {
        const person = await lockPerson(tx, input.userId);
        if (person === undefined || person.status === "deleted") return err({ code: "not_found" });
        if (person.status !== "suspended") return err({ code: "not_suspended" });
        const note = checkReinstatement(input.note, settings);
        if (!note.ok) return note;
        const now = clock();
        await tx
          .update(users)
          .set({ status: "active", suspendedUntil: null, updatedAt: now })
          .where(eq(users.id, input.userId));
        const actionId = await addAction(
          tx,
          {
            userId: input.userId,
            kind: "reinstatement",
            rule: null,
            reason: note.value,
            operatorId: by.userId,
          },
          now,
        );
        await recordAudit(tx, {
          operator: by,
          action: "user.reinstated",
          subjectType: "user",
          subjectId: input.userId,
          after: { fields: ["status", "suspendedUntil"], moderationActionId: actionId },
          request,
        });
        return ok({ actionId });
      });
    },

    async answerAppeal(by, input, request) {
      return db.transaction(async (tx) => {
        const [found] = await tx
          .select({ userId: moderationActions.userId })
          .from(moderationActions)
          .where(eq(moderationActions.id, input.actionId));
        if (found === undefined) return err({ code: "not_found" });
        // The person first, as everywhere: lifting a suspension changes their row.
        const person = found.userId === null ? undefined : await lockPerson(tx, found.userId);
        const [action] = await tx
          .select()
          .from(moderationActions)
          .where(eq(moderationActions.id, input.actionId))
          .for("update");
        if (action === undefined) return err({ code: "not_found" });
        const answer = checkAppealAnswer(action, input.answer, settings);
        if (!answer.ok) return answer;
        const now = clock();
        await tx
          .update(moderationActions)
          .set({
            appealAnswer: answer.value,
            appealOutcome: input.outcome,
            appealAnsweredAt: now,
            appealAnsweredById: by.userId,
            updatedAt: now,
          })
          .where(eq(moderationActions.id, action.id));
        const { userId } = action;
        const lifted =
          userId !== null &&
          input.outcome === "reversed" &&
          action.kind === "suspension" &&
          person?.status === "suspended" &&
          (await latestSuspension(tx, userId)) === action.id;
        if (lifted) {
          await tx
            .update(users)
            .set({ status: "active", suspendedUntil: null, updatedAt: now })
            .where(eq(users.id, userId));
        }
        // Reversing a hiding shows the content again, unless it has changed
        // or been hidden again since (3.4.3).
        const content =
          input.outcome === "reversed" &&
          action.kind === "content_hidden" &&
          action.contentId !== null &&
          isHideableNow(action.contentKind)
            ? { kind: action.contentKind, id: action.contentId }
            : undefined;
        let shown: boolean | { readonly copies: readonly string[] } = false;
        if (content !== undefined && (await latestHiding(tx, content)) === action.id) {
          const locked = await lockContent(tx, content);
          if (locked !== undefined && locked.hiddenAt !== null) {
            await setHidden(tx, content, locked.also, null, now);
            shown = locked.also.length === 0 ? true : { copies: locked.also };
          }
        }
        if (userId !== null) {
          await recordEvents(tx, [{ type: "AppealAnswered", actionId: action.id }], now);
        }
        await recordAudit(tx, {
          operator: by,
          action: "moderation_action.appeal_answered",
          subjectType: "moderation_action",
          subjectId: action.id,
          after: {
            fields: ["appealAnswer", "appealOutcome", "appealAnsweredAt"],
            // The person's own row changed too: named, as reinstate names it.
            ...(lifted
              ? { suspensionLifted: { userId, fields: ["status", "suspendedUntil"] } }
              : {}),
            ...(shown !== false && content !== undefined
              ? {
                  contentShown: {
                    ...content,
                    fields: [hiding[content.kind].field],
                    ...(shown === true ? {} : shown),
                  },
                }
              : {}),
          },
          request,
        });
        return ok(undefined);
      });
    },

    async hideContent(by, input, request) {
      const checked = checkStatement(input, settings);
      if (!checked.ok) return checked;
      const { rule, reason } = checked.value;
      const { content } = input;
      return db.transaction(async (tx) => {
        const ownerId = await ownerOf(tx, content);
        const owner = ownerId === undefined ? undefined : await lockPerson(tx, ownerId);
        if (
          ownerId === undefined ||
          owner === undefined ||
          owner.status === "deleted" ||
          !(await reportExists(tx, input.reportId))
        ) {
          return err({ code: "not_found" });
        }
        const shown = await lockContent(tx, content);
        if (shown === undefined) return err({ code: "not_found" });
        if (shown.hiddenAt !== null) return err({ code: "already_hidden" });
        const now = clock();
        await setHidden(tx, content, shown.also, now, now);
        const actionId = await addAction(
          tx,
          {
            userId: ownerId,
            kind: "content_hidden",
            reportId: input.reportId ?? null,
            rule,
            reason,
            contentKind: content.kind,
            contentId: content.id,
            operatorId: by.userId,
          },
          now,
        );
        const audit = hiding[content.kind];
        await recordAudit(tx, {
          operator: by,
          action: audit.action,
          subjectType: audit.subjectType,
          subjectId: content.id,
          after: {
            fields: [audit.field],
            moderationActionId: actionId,
            ...(input.reportId === undefined ? {} : { reportId: input.reportId }),
            // The same message in the other passengers' conversations.
            ...(shown.also.length === 0 ? {} : { copies: shown.also }),
          },
          request,
        });
        return ok({ actionId });
      });
    },

    async cancelTrip(by, input, request) {
      const checked = checkStatement(input, settings);
      if (!checked.ok) return checked;
      const { rule, reason } = checked.value;
      return db.transaction(async (tx) => {
        const [trip] = await tx
          .select({ driverId: trips.driverId })
          .from(trips)
          .where(eq(trips.id, input.tripId));
        if (trip === undefined || !(await reportExists(tx, input.reportId))) {
          return err({ code: "not_found" });
        }
        // The driver first, then the trip, as everywhere.
        await lockPerson(tx, trip.driverId);
        const cancelled = await cancelTripAsOperator(
          tx,
          input.tripId,
          input.countsOnReliability,
          clock,
        );
        if (!cancelled.ok) return cancelled;
        if (!cancelled.value) return err({ code: "already_cancelled" });
        // The bookings and requests it ended, for the audit entry, as a suspension names them.
        const ended = await tx
          .select({ id: bookings.id })
          .from(bookings)
          .innerJoin(trips, eq(trips.id, bookings.tripId))
          .where(
            and(
              eq(bookings.tripId, input.tripId),
              eq(bookings.cancelledBy, "operator"),
              eq(bookings.cancelledAt, trips.cancelledAt),
            ),
          )
          .orderBy(asc(bookings.id));
        const now = clock();
        const actionId = await addAction(
          tx,
          {
            userId: trip.driverId,
            kind: "trip_cancelled",
            reportId: input.reportId ?? null,
            rule,
            reason,
            contentKind: "trip",
            contentId: input.tripId,
            operatorId: by.userId,
          },
          now,
        );
        await recordAudit(tx, {
          operator: by,
          action: "trip.cancelled",
          subjectType: "trip",
          subjectId: input.tripId,
          after: {
            fields: ["status", "cancelledAt", "cancelledBy", "countsOnReliability"],
            moderationActionId: actionId,
            ...(input.reportId === undefined ? {} : { reportId: input.reportId }),
            cancelledBookings: ended.map(({ id }) => id),
          },
          request,
        });
        return ok({ actionId });
      });
    },

    async closeReport(by, input, request) {
      return db.transaction(async (tx) => {
        const [report] = await tx
          .select({ status: reports.status, reporterId: reports.reporterId })
          .from(reports)
          .where(eq(reports.id, input.reportId))
          .for("no key update");
        if (report === undefined) return err({ code: "not_found" });
        if (report.status === "closed") return err({ code: "already_closed" });
        const now = clock();
        await tx
          .update(reports)
          .set({
            status: "closed",
            outcome: input.outcome,
            closedAt: now,
            closedById: by.userId,
            updatedAt: now,
          })
          .where(eq(reports.id, input.reportId));
        if (report.reporterId !== null) {
          await recordEvents(tx, [{ type: "ReportClosed", reportId: input.reportId }], now);
        }
        await recordAudit(tx, {
          operator: by,
          action: "report.closed",
          subjectType: "report",
          subjectId: input.reportId,
          after: { fields: ["status", "outcome", "closedAt"] },
          request,
        });
        return ok(undefined);
      });
    },
  };
}

/**
 * The person's latest suspension: the one they are under while suspended,
 * as a new one waits for the last to end (3.6.1).
 */
async function latestSuspension(tx: Transaction, userId: string) {
  const [row] = await tx
    .select({ id: moderationActions.id })
    .from(moderationActions)
    .where(and(eq(moderationActions.userId, userId), eq(moderationActions.kind, "suspension")))
    .orderBy(desc(moderationActions.createdAt), desc(moderationActions.id))
    .limit(1);
  return row?.id;
}

/**
 * Ends the suspensions whose end has passed and tells each person (3.6.3),
 * for the minute job; returns how many. One the operator is acting on is
 * left for the next run.
 */
export async function endDueSuspensions(db: Database, now: Date): Promise<number> {
  const due = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.status, "suspended"), lte(users.suspendedUntil, now)));
  let ended = 0;
  for (const { id } of due) {
    const done = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: users.id, suspendedUntil: users.suspendedUntil })
        .from(users)
        .where(and(eq(users.id, id), eq(users.status, "suspended")))
        .for("update", { skipLocked: true });
      if (
        row === undefined ||
        row.suspendedUntil === null ||
        row.suspendedUntil.getTime() > now.getTime()
      ) {
        return false;
      }
      await tx
        .update(users)
        .set({ status: "active", suspendedUntil: null, updatedAt: now })
        .where(eq(users.id, id));
      await recordEvents(tx, [{ type: "SuspensionEnded", userId: id }], now);
      return true;
    });
    if (done) ended += 1;
  }
  return ended;
}
