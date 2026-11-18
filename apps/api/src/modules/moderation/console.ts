// The console's reports, actions and appeals (spec 9, 3.4 to 3.6;
// milestone 9, PR 7): the queue, what the system knows about a report and
// both people (3.4.2), the conversation a message report covers through
// `readConversationAsOperator`, which logs each opening (R9.6), and the
// operator's actions through the moderation service, which audits each.
import type {
  AdminAnswerAppealBody,
  AdminCancelTripBody,
  AdminConversationMessage,
  AdminHideContentBody,
  AdminModerationAction,
  AdminPerson,
  AdminRecentTrip,
  AdminReinstateBody,
  AdminReport,
  AdminReportListItem,
  AdminSuspendBody,
  AdminWarnBody,
} from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  defaultSafetySettings,
  ok,
  type BookingStatus,
  type ReportOutcome,
  type Result,
  type Role,
  type SafetySettings,
  type TripStatus,
} from "@shareride/domain";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import type { AuditEntry } from "../admin/audit.ts";
import { readConversationAsOperator, type ReadingRefused } from "../chat/operator.ts";
import {
  createModerationService,
  type AnswerAppealError,
  type CancelTripError,
  type CloseReportError,
  type HideContentError,
  type ReinstateError,
  type SuspendError,
  type WarnError,
} from "./actions.ts";
import { createConsoleReads } from "./console-reads.ts";

const { bookings, messages, moderationActions, reports, reviews, trips, users } = schema;

/** The last closed reports and answered appeals the lists show. */
const closedShown = 50;
/** Each side's earlier reports and actions on a report's page. */
const historyShown = 20;
const recentTripsShown = 10;
/** A booking that held a seat: paid, then ridden or missed. */
const ridden: BookingStatus[] = ["confirmed", "completed", "no_show"];

/** Who acts in the console, for the audit log. */
export interface ConsoleActor {
  readonly operator: AuditEntry["operator"];
  readonly request: AuditEntry["request"];
}

export interface ModerationConsoleService {
  reports(state: "open" | "closed"): Promise<readonly AdminReportListItem[]>;
  report(id: string): Promise<AdminReport | undefined>;
  /** The conversation a message report covers (R9.6). */
  conversation(
    id: string,
    actor: ConsoleActor,
  ): Promise<Result<readonly AdminConversationMessage[], ReadingRefused>>;
  closeReport(
    id: string,
    outcome: ReportOutcome,
    actor: ConsoleActor,
  ): Promise<Result<AdminReport, CloseReportError>>;
  warn(
    userId: string,
    body: AdminWarnBody,
    actor: ConsoleActor,
  ): Promise<Result<AdminModerationAction, WarnError>>;
  suspend(
    userId: string,
    body: AdminSuspendBody,
    actor: ConsoleActor,
  ): Promise<
    Result<
      {
        readonly action: AdminModerationAction;
        readonly tripsCancelled: number;
        readonly bookingsCancelled: number;
      },
      SuspendError
    >
  >;
  reinstate(
    userId: string,
    body: AdminReinstateBody,
    actor: ConsoleActor,
  ): Promise<Result<AdminModerationAction, ReinstateError>>;
  hideContent(
    body: AdminHideContentBody,
    actor: ConsoleActor,
  ): Promise<Result<AdminModerationAction, HideContentError>>;
  cancelTrip(
    tripId: string,
    body: AdminCancelTripBody,
    actor: ConsoleActor,
  ): Promise<Result<AdminModerationAction, CancelTripError>>;
  appeals(state: "open" | "answered"): Promise<readonly AdminModerationAction[]>;
  answerAppeal(
    actionId: string,
    body: AdminAnswerAppealBody,
    actor: ConsoleActor,
  ): Promise<Result<AdminModerationAction, AnswerAppealError>>;
}

export function createModerationConsoleService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings?: SafetySettings;
}): ModerationConsoleService {
  const { db } = dependencies;
  const settings = dependencies.settings ?? defaultSafetySettings;
  const moderation = createModerationService({ ...dependencies, settings });
  const { listItems, actionsOf, actionsWhere, stopsOf, shownStop, routeOf } = createConsoleReads({
    db,
    settings,
  });

  async function action(id: string): Promise<AdminModerationAction> {
    const [found] = await actionsWhere(eq(moderationActions.id, id), false);
    if (found === undefined) throw new Error("The moderation action was just stored.");
    return found;
  }

  /**
   * The trips the person drove or held a seat on, latest first (3.4.2): a
   * request declined, expired or cancelled before it was paid is no ride.
   */
  async function recentTrips(userId: string): Promise<AdminRecentTrip[]> {
    const driven = await db
      .select({ tripId: trips.id, status: trips.status, departsAt: trips.departsAt })
      .from(trips)
      .where(and(eq(trips.driverId, userId), ne(trips.status, "draft")))
      .orderBy(desc(trips.departsAt))
      .limit(recentTripsShown);
    const booked = await db
      .select({
        tripId: trips.id,
        status: trips.status,
        departsAt: trips.departsAt,
        fromStopId: bookings.fromStopId,
        toStopId: bookings.toStopId,
      })
      .from(bookings)
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .where(and(eq(bookings.passengerId, userId), inArray(bookings.status, ridden)))
      .orderBy(desc(trips.departsAt))
      .limit(recentTripsShown);
    const stops = await stopsOf([...driven, ...booked].map((trip) => trip.tripId));
    const byId = new Map(stops.map((stop) => [stop.id, stop]));
    const all = [
      ...driven.map((trip) => ({
        tripId: trip.tripId,
        role: "driver" as const,
        status: trip.status as TripStatus,
        departsAt: trip.departsAt,
        ...routeOf(stops, trip.tripId),
      })),
      ...booked.map((trip) => ({
        tripId: trip.tripId,
        role: "passenger" as const,
        status: trip.status as TripStatus,
        departsAt: trip.departsAt,
        from: shownStop(byId.get(trip.fromStopId)),
        to: shownStop(byId.get(trip.toStopId)),
      })),
    ];
    return all
      .sort((a, b) => (b.departsAt?.getTime() ?? 0) - (a.departsAt?.getTime() ?? 0))
      .slice(0, recentTripsShown)
      .map(({ tripId, role, status, from, to }) => ({ tripId, role, status, from, to }));
  }

  /** What the console knows of one side of a report, besides the report itself. */
  async function sideOf(person: AdminPerson, reportId: string) {
    const others = (side: "reporterId" | "subjectUserId") =>
      db
        .select()
        .from(reports)
        .where(and(eq(reports[side], person.userId), ne(reports.id, reportId)))
        .orderBy(desc(reports.createdAt), desc(reports.id))
        .limit(historyShown);
    return {
      person,
      reportsBy: await listItems(await others("reporterId")),
      reportsAbout: await listItems(await others("subjectUserId")),
      recentTrips: await recentTrips(person.userId),
      actions: await actionsWhere(eq(moderationActions.userId, person.userId), true, historyShown),
    };
  }

  async function report(id: string): Promise<AdminReport | undefined> {
    const [row] = await db.select().from(reports).where(eq(reports.id, id));
    if (row === undefined) return undefined;
    const [item] = await listItems([row]);
    if (item === undefined) throw new Error("A report lists as itself.");
    const [trip] =
      row.tripId === null
        ? []
        : await db
            .select({
              id: trips.id,
              driverId: trips.driverId,
              status: trips.status,
              note: trips.note,
              noteHiddenAt: trips.noteHiddenAt,
            })
            .from(trips)
            .where(eq(trips.id, row.tripId));
    const route = trip === undefined ? undefined : routeOf(await stopsOf([trip.id]), trip.id);
    const [booking] =
      row.bookingId === null
        ? []
        : await db
            .select({ id: bookings.id, status: bookings.status, seats: bookings.seats })
            .from(bookings)
            .where(eq(bookings.id, row.bookingId));
    // The words stay in the conversation, whose opening is logged (R9.6).
    const [message] =
      row.messageId === null
        ? []
        : await db
            .select({ id: messages.id, sentAt: messages.sentAt, hiddenAt: messages.hiddenAt })
            .from(messages)
            .where(eq(messages.id, row.messageId));
    // The review's words are shown, so that the operator can judge them.
    const [review] =
      row.reviewId === null
        ? []
        : await db
            .select({
              id: reviews.id,
              rating: reviews.rating,
              comment: reviews.comment,
              authorRole: reviews.authorRole,
              createdAt: reviews.createdAt,
              hiddenAt: reviews.hiddenAt,
            })
            .from(reviews)
            .where(eq(reviews.id, row.reviewId));
    const [about] =
      row.subject === "user" && row.subjectUserId !== null
        ? await db
            .select({ text: users.about, hiddenAt: users.aboutHiddenAt })
            .from(users)
            .where(eq(users.id, row.subjectUserId))
        : [];
    return {
      ...item,
      description: row.description,
      trip:
        trip === undefined || route === undefined
          ? null
          : {
              id: trip.id,
              driverId: trip.driverId,
              status: trip.status as TripStatus,
              ...route,
              note: trip.note,
              noteHidden: trip.noteHiddenAt !== null,
            },
      booking:
        booking === undefined
          ? null
          : { id: booking.id, status: booking.status as BookingStatus, seats: booking.seats },
      message:
        message === undefined
          ? null
          : {
              id: message.id,
              sentAt: message.sentAt.toISOString(),
              removed: message.hiddenAt !== null,
            },
      review:
        review === undefined
          ? null
          : {
              id: review.id,
              rating: review.rating,
              comment: review.comment,
              authorRole: review.authorRole as Role,
              writtenAt: review.createdAt.toISOString(),
              hidden: review.hiddenAt !== null,
            },
      about:
        about === undefined || about.text === null || about.text === ""
          ? null
          : { text: about.text, hidden: about.hiddenAt !== null },
      conversation: row.subject === "message" && row.bookingId !== null,
      actions: await actionsWhere(eq(moderationActions.reportId, row.id), false),
      reporterSide: item.reporter === null ? null : await sideOf(item.reporter, row.id),
      reportedSide: item.reported === null ? null : await sideOf(item.reported, row.id),
    };
  }

  const by = (actor: ConsoleActor) => actor.operator;
  const reportOf = (body: { readonly reportId?: string | undefined }) =>
    body.reportId === undefined ? {} : { reportId: body.reportId };

  return {
    async reports(state) {
      const rows =
        state === "open"
          ? // The queue: safety first, then the oldest (3.4.1), as `queueOrder` has it.
            await db
              .select()
              .from(reports)
              .where(eq(reports.status, "open"))
              .orderBy(desc(reports.urgent), asc(reports.createdAt), asc(reports.id))
          : await db
              .select()
              .from(reports)
              .where(eq(reports.status, "closed"))
              .orderBy(desc(reports.closedAt), desc(reports.id))
              .limit(closedShown);
      return listItems(rows);
    },

    report,

    conversation(id, actor) {
      return readConversationAsOperator(db, {
        subject: { type: "report", id },
        operator: actor.operator,
        request: actor.request,
      });
    },

    async closeReport(id, outcome, actor) {
      const closed = await moderation.closeReport(
        by(actor),
        { reportId: id, outcome },
        actor.request,
      );
      if (!closed.ok) return closed;
      const shown = await report(id);
      if (shown === undefined) throw new Error("A report just closed is kept.");
      return ok(shown);
    },

    async warn(userId, body, actor) {
      const warned = await moderation.warn(
        by(actor),
        { userId, rule: body.rule, reason: body.reason, ...reportOf(body) },
        actor.request,
      );
      return warned.ok ? ok(await action(warned.value.actionId)) : warned;
    },

    async suspend(userId, body, actor) {
      const suspended = await moderation.suspend(
        by(actor),
        {
          userId,
          rule: body.rule,
          reason: body.reason,
          until: body.until === null ? null : new Date(body.until),
          ...reportOf(body),
        },
        actor.request,
      );
      if (!suspended.ok) return suspended;
      const { actionId, tripsCancelled, bookingsCancelled } = suspended.value;
      return ok({ action: await action(actionId), tripsCancelled, bookingsCancelled });
    },

    async reinstate(userId, body, actor) {
      const reinstated = await moderation.reinstate(
        by(actor),
        { userId, note: body.note },
        actor.request,
      );
      return reinstated.ok ? ok(await action(reinstated.value.actionId)) : reinstated;
    },

    async hideContent(body, actor) {
      const hidden = await moderation.hideContent(
        by(actor),
        { content: body.content, rule: body.rule, reason: body.reason, ...reportOf(body) },
        actor.request,
      );
      return hidden.ok ? ok(await action(hidden.value.actionId)) : hidden;
    },

    async cancelTrip(tripId, body, actor) {
      const cancelled = await moderation.cancelTrip(
        by(actor),
        {
          tripId,
          rule: body.rule,
          reason: body.reason,
          countsOnReliability: body.countsOnReliability,
          ...reportOf(body),
        },
        actor.request,
      );
      return cancelled.ok ? ok(await action(cancelled.value.actionId)) : cancelled;
    },

    async appeals(state) {
      const appealed = isNotNull(moderationActions.appealedAt);
      const rows =
        state === "open"
          ? // Waiting longest first, as reports are.
            await db
              .select()
              .from(moderationActions)
              .where(and(appealed, isNull(moderationActions.appealAnsweredAt)))
              .orderBy(asc(moderationActions.appealedAt), asc(moderationActions.id))
          : await db
              .select()
              .from(moderationActions)
              .where(and(appealed, isNotNull(moderationActions.appealAnsweredAt)))
              .orderBy(desc(moderationActions.appealAnsweredAt), desc(moderationActions.id))
              .limit(closedShown);
      return actionsOf(rows);
    },

    async answerAppeal(actionId, body, actor) {
      const answered = await moderation.answerAppeal(
        by(actor),
        { actionId, outcome: body.outcome, answer: body.answer },
        actor.request,
      );
      if (!answered.ok) return answered;
      return ok(await action(actionId));
    },
  };
}
