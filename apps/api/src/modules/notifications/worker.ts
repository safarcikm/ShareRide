import { schema, type Database } from "@shareride/db";
import {
  alertChannels,
  canUseConsole,
  channelsFor,
  defaultNotificationSettings,
  defaultReviewSettings,
  defaultSafetySettings,
  defaultTripDaySettings,
  eventAttempts,
  isAccountNotice,
  isOperatorNotice,
  notificationsFor,
  operatorNoticeKinds,
  operatorRole,
  pauseStillApplies,
  payReminderAt,
  reminderStillTimely,
  reminderTimes,
  requestHalfwayAt,
  retryAt,
  reviewClosesAt,
  reviewReminderAt,
  sendLeaseSeconds,
  startOfIcelandDay,
  statusAt,
  stillApplies,
  unreadSummaryAt,
  type AppealOutcome,
  type BookingStatus,
  type CancelReason,
  type CarColour,
  type ChannelDecision,
  type MeetingPointStatus,
  type NotificationEvent,
  type ModeratedContent,
  type ModerationActionKind,
  type ModerationRule,
  type NotificationKind,
  type NotificationSettings,
  type OutboxEventType,
  type Recipient,
  type ReportOutcome,
  type ReviewSettings,
  type TripRole,
  channelSwitches,
  switchExemptKinds,
  switchKeys,
  switchReminderNumber,
  movedFar,
  type SwitchKey,
  paidInApp,
} from "@shareride/domain";
import type { CarFacts } from "@shareride/i18n";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notExists,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { EmailChannel } from "../../platform/email.ts";
import { MaybeSent } from "../../platform/maybe-sent.ts";
import { deviceNotRegistered, type PushReceipt, type PushSender } from "../../platform/push.ts";
import { SmsMaybeSent, type SmsSender } from "../../platform/sms.ts";
import { announcementReaders } from "../beta/announcements.ts";
import { methodOf, type Queryable, type Transaction } from "../bookings/seats.ts";
import { quickOf } from "../chat/service.ts";
import { isHidden, shown } from "../privacy/hidden.ts";
import { cancellationSettingsIn } from "../settings/rule-settings.ts";
import { answerByOf, disputesOf } from "../trip-day/disputes.ts";
import { emailContent } from "./email-content.ts";
import { newMembersFactsOf } from "./new-members.ts";
import { preferencesOf } from "./preferences.ts";
import {
  isOperatorFacts,
  notificationText,
  smsText,
  type AccountNoticeFacts,
  type NotificationFacts,
  type OperatorNoticeFacts,
  type PausedPoint,
  type MovedPoint,
  type PointMovedFacts,
  type PointPausedFacts,
  type TripReminderFacts,
} from "./texts.ts";

// The notification worker (spec 7, 3.7; plan 4.4), every few seconds inside
// the API. Each step takes rows with FOR UPDATE SKIP LOCKED, so two API
// instances share the work, and unique keys make a second run add nothing.

const {
  announcements,
  bookings,
  conversations,
  dataExports,
  disputes,
  meetingPoints,
  messages,
  moderationActions,
  notificationDeliveries,
  notifications,
  outboxEvents,
  feedback,
  privacyRequests,
  pushTickets,
  pushTokens,
  reports,
  reviews,
  scheduledNotifications,
  sessions,
  tripChanges,
  trips,
  tripStops,
  users,
  vehicles,
} = schema;

/** Rows each step takes per run; the rest wait for the next run. */
const batchSize = 50;

const minuteMs = 60_000;
/**
 * A push's receipt is asked for this long after it was sent; one not ready
 * is asked for again, until the push service no longer keeps it.
 */
const receiptAfterMs = 15 * minuteMs;
const receiptsKeptMs = 24 * 60 * minuteMs;
/** The push service answers about at most this many tickets at a time. */
const receiptsPerRun = 1000;

export interface WorkerRun {
  /** Events turned into notifications. */
  readonly events: number;
  /** Scheduled notifications whose moment came, sent or dropped. */
  readonly scheduled: number;
  readonly sent: number;
  /** Sends that failed, to be tried again or given up. */
  readonly failed: number;
  /** Push receipts that came back. */
  readonly receipts: number;
}

export interface NotificationWorker {
  /** One pass: events, scheduled notifications that are due, sends that are due, then push receipts. */
  runOnce(): Promise<WorkerRun>;
}

type Delivery = typeof notificationDeliveries.$inferSelect;

/** The switches for emergencies that are off now (spec 10, 3.3). */
type SwitchesOff = () => Promise<readonly SwitchKey[]>;

/**
 * Each switch for emergencies: on or off, and since when, as the settings
 * service gives them.
 */
export type WorkerSwitches = Readonly<
  Record<SwitchKey, { readonly on: boolean; readonly since: Date | null }>
>;
type Parties = NonNullable<Awaited<ReturnType<typeof partiesOf>>>;

/** A booking's driver, passenger and deadlines. */
async function partiesOf(q: Queryable, bookingId: string) {
  const [row] = await q
    .select({
      id: bookings.id,
      tripId: bookings.tripId,
      passengerId: bookings.passengerId,
      driverId: trips.driverId,
      status: bookings.status,
      requestedAt: bookings.requestedAt,
      expiresAt: bookings.expiresAt,
      decidedAt: bookings.decidedAt,
      paymentDueAt: bookings.paymentDueAt,
      completedAt: bookings.completedAt,
    })
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .where(eq(bookings.id, bookingId));
  return row;
}

/** The push tokens of the person's sessions that have not ended (plan 4.4, channels). */
function tokensOf(q: Queryable, userId: string) {
  return q
    .select({ id: pushTokens.id, token: pushTokens.token })
    .from(pushTokens)
    .innerJoin(sessions, eq(sessions.id, pushTokens.sessionId))
    .where(and(eq(pushTokens.userId, userId), isNull(sessions.endedAt)));
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An ID from an event's payload (events carry IDs only), or none if it is not one. */
function idIn(payload: Readonly<Record<string, string>>, name: string): string | undefined {
  const value = payload[name];
  return typeof value === "string" && uuidPattern.test(value) ? value : undefined;
}

/** Who said "I'm here", as a `CheckedIn` event says: the other person is told. */
function doneBy(payload: Readonly<Record<string, string>>, type: OutboxEventType): TripRole {
  const by = payload["by"];
  if (by === "passenger" || by === "driver") return by;
  throw new Error(`A ${type} event names who did it.`);
}

/** Who cancelled, as a `BookingCancelled` event says: one side, or ShareRide (spec 9, 3.6). */
function cancelledBy(payload: Readonly<Record<string, string>>): TripRole | "operator" {
  return payload["by"] === "operator" ? "operator" : doneBy(payload, "BookingCancelled");
}

const boards = alias(tripStops, "boards");
const alights = alias(tripStops, "alights");

/** The new car of a change of car, as passengers read it (spec 6, 3.2). */
async function newCarOf(q: Queryable, tripChangeId: string): Promise<CarFacts | undefined> {
  const [row] = await q
    .select({ kind: tripChanges.kind, after: tripChanges.after })
    .from(tripChanges)
    .where(eq(tripChanges.id, tripChangeId));
  if (row?.kind !== "vehicle") return undefined;
  return {
    make: String(row.after["make"]),
    model: String(row.after["model"]),
    colour: row.after["colour"] as CarColour,
  };
}

/** The new stop of a change, by its names and time (spec 6, 3.2). */
async function newStopOf(q: Queryable, tripChangeId: string) {
  const [row] = await q
    .select({ kind: tripChanges.kind, after: tripChanges.after })
    .from(tripChanges)
    .where(eq(tripChanges.id, tripChangeId));
  if (row?.kind !== "addStop") return undefined;
  return {
    name: { is: String(row.after["nameIs"]), en: String(row.after["nameEn"]) },
    plannedAt: new Date(String(row.after["plannedAt"])),
  };
}

/** The stop a change removed, by its names (spec 6, 3.2). */
async function removedStopOf(q: Queryable, tripChangeId: string) {
  const [row] = await q
    .select({ kind: tripChanges.kind, before: tripChanges.before })
    .from(tripChanges)
    .where(eq(tripChanges.id, tripChangeId));
  if (row?.kind !== "removeStop") return undefined;
  return { name: { is: String(row.before["nameIs"]), en: String(row.before["nameEn"]) } };
}

/**
 * A moved departure as one passenger sees it (spec 6, 3.2): their boarding
 * time before and after this change, and how far the departure is now from
 * where it was when they booked (R6.3). Every stop moves with the departure
 * (R6.2), so the boarding time is always as far from it.
 */
async function moveOf(q: Queryable, tripChangeId: string, bookingId: string) {
  const [row] = await q
    .select({
      kind: tripChanges.kind,
      before: tripChanges.before,
      after: tripChanges.after,
      boardsAt: boards.plannedAt,
      departsAt: trips.departsAt,
      departsAtWhenBooked: bookings.departsAtWhenBooked,
      settingsVersion: bookings.settingsVersion,
    })
    .from(tripChanges)
    .innerJoin(bookings, eq(bookings.tripId, tripChanges.tripId))
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .innerJoin(boards, eq(boards.id, bookings.fromStopId))
    .where(and(eq(tripChanges.id, tripChangeId), eq(bookings.id, bookingId)));
  if (row?.kind !== "departure" || row.boardsAt === null || row.departsAt === null) {
    return undefined;
  }
  const before = new Date(String(row.before["departsAt"]));
  const after = new Date(String(row.after["departsAt"]));
  const boardingAfterMs = row.boardsAt.getTime() - row.departsAt.getTime();
  // Null only for a booking the previous version made during a deploy.
  const booked = row.departsAtWhenBooked ?? before;
  return {
    from: new Date(before.getTime() + boardingAfterMs),
    to: new Date(after.getTime() + boardingAfterMs),
    // Not rounded, so it is far exactly when the domain's `movedFar` says so (R6.3).
    byMinutes: (after.getTime() - booked.getTime()) / minuteMs,
    // By the booking's own `major_time_change` (R10.3).
    far: movedFar(booked, after, await cancellationSettingsIn(q, row.settingsVersion)),
  };
}
const boardPoint = alias(meetingPoints, "board_point");
const alightPoint = alias(meetingPoints, "alight_point");
const recipients = alias(users, "recipient");
const drivers = alias(users, "driver");
const passengers = alias(users, "passenger");

const passengerReminders = { reminder_evening: "evening", reminder_hour: "hour" } as const;
const driverReminders = {
  reminder_evening_driver: "evening",
  reminder_hour_driver: "hour",
} as const;

const isDriverReminder = (kind: string): kind is keyof typeof driverReminders =>
  kind in driverReminders;

/** Which reminder a notification is, and the moment its words count to; null for the rest. */
function reminderOf(
  facts:
    | NotificationFacts
    | TripReminderFacts
    | PointPausedFacts
    | PointMovedFacts
    | AccountNoticeFacts
    | OperatorNoticeFacts,
) {
  if (
    isAccountNotice(facts.kind) ||
    isOperatorFacts(facts) ||
    "point" in facts ||
    facts.kind === "meeting_point_moved_driver"
  ) {
    return null;
  }
  if ("passengers" in facts) {
    return { which: driverReminders[facts.kind], startsAt: facts.departsAt };
  }
  if (facts.kind === "reminder_evening" || facts.kind === "reminder_hour") {
    return { which: passengerReminders[facts.kind], startsAt: facts.boardsAt };
  }
  return null;
}

const named = (locale: "is" | "en", point: { readonly is: string; readonly en: string | null }) =>
  locale === "en" ? (point.en ?? point.is) : point.is;

/**
 * A driver's trip reminder as of now (3.5): the passengers whose bookings
 * are still confirmed, in the order they get in, and whether the car still
 * lacks its number plate (never the plate itself, R7.9).
 */
async function tripFactsOf(q: Queryable, notification: typeof notifications.$inferSelect) {
  if (notification.tripId === null || !isDriverReminder(notification.kind)) return undefined;
  const [trip] = await q
    .select({
      departsAt: trips.departsAt,
      locale: recipients.locale,
      email: recipients.email,
      emailVerifiedAt: recipients.emailVerifiedAt,
      vehicleId: trips.vehicleId,
      registration: vehicles.registration,
    })
    .from(trips)
    .innerJoin(recipients, eq(recipients.id, notification.recipientId))
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .where(eq(trips.id, notification.tripId));
  if (trip === undefined || trip.departsAt === null) return undefined;
  const locale = trip.locale === "is" ? "is" : "en";
  const booked = await q
    .select({
      name: passengers.firstName,
      board: { is: boardPoint.nameIs, en: boardPoint.nameEn },
      alight: { is: alightPoint.nameIs, en: alightPoint.nameEn },
    })
    .from(bookings)
    .innerJoin(passengers, eq(passengers.id, bookings.passengerId))
    .innerJoin(boards, eq(boards.id, bookings.fromStopId))
    .innerJoin(alights, eq(alights.id, bookings.toStopId))
    .innerJoin(boardPoint, eq(boardPoint.id, boards.meetingPointId))
    .innerJoin(alightPoint, eq(alightPoint.id, alights.meetingPointId))
    .where(and(eq(bookings.tripId, notification.tripId), eq(bookings.status, "confirmed")))
    .orderBy(asc(boards.position), asc(bookings.createdAt));
  const facts: TripReminderFacts = {
    kind: notification.kind,
    role: "driver",
    tripId: notification.tripId,
    departsAt: trip.departsAt,
    passengers: booked.map((row) => ({
      name: row.name ?? "",
      from: named(locale, row.board),
      to: named(locale, row.alight),
    })),
    plateMissing: trip.vehicleId !== null && trip.registration === null,
  };
  return {
    facts,
    locale,
    recipientId: notification.recipientId,
    email: trip.emailVerifiedAt === null ? null : trip.email,
    booking: null,
  } as const;
}

/**
 * A meeting point as a notification of its pause tells of it, in the
 * recipient's language; none once it is back in use, as the news no
 * longer applies (spec 2, 3.6.4). A point retired while paused still
 * applies: the trips that stop there need another stop all the same.
 */
async function pausedPointOf(
  q: Queryable,
  pointId: string | null,
  locale: "is" | "en",
): Promise<PausedPoint | null> {
  if (pointId === null) return null;
  const [point] = await q
    .select({
      status: meetingPoints.status,
      nameIs: meetingPoints.nameIs,
      nameEn: meetingPoints.nameEn,
      reasonIs: meetingPoints.pauseReasonIs,
      reasonEn: meetingPoints.pauseReasonEn,
      until: meetingPoints.pausedUntil,
    })
    .from(meetingPoints)
    .where(eq(meetingPoints.id, pointId));
  if (
    point === undefined ||
    !pauseStillApplies(point.status as MeetingPointStatus, point.reasonIs !== null)
  ) {
    return null;
  }
  const reason = locale === "en" ? point.reasonEn : point.reasonIs;
  const retired = point.status === "retired";
  return {
    name: named(locale, { is: point.nameIs, en: point.nameEn }),
    reason: reason ?? point.reasonIs ?? "",
    until: retired ? null : point.until,
    retired,
  };
}

/** A moved meeting point as its news names it, in the recipient's language (spec 2, 3.6.6). */
async function movedPointOf(
  q: Queryable,
  pointId: string | null,
  locale: "is" | "en",
): Promise<MovedPoint | null> {
  if (pointId === null) return null;
  const [point] = await q
    .select({ nameIs: meetingPoints.nameIs, nameEn: meetingPoints.nameEn })
    .from(meetingPoints)
    .where(eq(meetingPoints.id, pointId));
  return point === undefined
    ? null
    : { name: named(locale, { is: point.nameIs, en: point.nameEn }) };
}

/**
 * A pause or a move told to the driver of a trip still to stop at the
 * point, with the trip's time there. `current` is false once the trip no
 * longer stops there or has passed it, or a paused point is back in use.
 */
async function pointNewsForDriverOf(
  q: Queryable,
  notification: typeof notifications.$inferSelect,
  now: Date,
) {
  if (
    notification.tripId === null ||
    (notification.kind !== "meeting_point_changed_driver" &&
      notification.kind !== "meeting_point_moved_driver")
  ) {
    return undefined;
  }
  const [row] = await q
    .select({
      locale: recipients.locale,
      email: recipients.email,
      emailVerifiedAt: recipients.emailVerifiedAt,
      tripStatus: trips.status,
      stopsAt: tripStops.plannedAt,
    })
    .from(trips)
    .innerJoin(recipients, eq(recipients.id, notification.recipientId))
    .leftJoin(
      tripStops,
      and(
        eq(tripStops.tripId, trips.id),
        notification.meetingPointId === null
          ? sql`false`
          : eq(tripStops.meetingPointId, notification.meetingPointId),
        isNull(tripStops.removedAt),
      ),
    )
    .where(eq(trips.id, notification.tripId));
  if (row === undefined) return undefined;
  const locale = row.locale === "is" ? "is" : "en";
  const running = row.tripStatus === "published" || row.tripStatus === "departed";
  const stopsAt = row.stopsAt ?? new Date(0);
  const ahead = running && row.stopsAt !== null && row.stopsAt > now;
  const to = {
    locale,
    recipientId: notification.recipientId,
    email: row.emailVerifiedAt === null ? null : row.email,
    phone: null,
    booking: null,
  } as const;
  if (notification.kind === "meeting_point_moved_driver") {
    const moved = await movedPointOf(q, notification.meetingPointId, locale);
    const facts: PointMovedFacts = {
      kind: "meeting_point_moved_driver",
      role: "driver",
      tripId: notification.tripId,
      stopsAt,
      movedPoint: moved ?? { name: "" },
    };
    return { facts, current: moved !== null && ahead, ...to };
  }
  const point = await pausedPointOf(q, notification.meetingPointId, locale);
  const facts: PointPausedFacts = {
    kind: "meeting_point_changed_driver",
    role: "driver",
    tripId: notification.tripId,
    stopsAt,
    point: point ?? { name: "", reason: "", until: null, retired: false },
  };
  return { facts, current: point !== null && ahead, ...to };
}

/** News about the person's account: their data or its deletion (spec 11), or a notice (spec 9). */
async function accountFactsOf(
  q: Queryable,
  notification: typeof notifications.$inferSelect,
  now: Date,
) {
  const kind = notification.kind as NotificationKind;
  if (!isAccountNotice(kind)) return undefined;
  switch (kind) {
    case "data_export_ready":
    case "account_deletion_scheduled":
      return exportFactsOf(q, notification, kind, now);
    case "privacy_request_answered":
      return answerFactsOf(q, notification);
    case "report_closed":
      return reportOutcomeFactsOf(q, notification);
    case "feedback_replied":
      return feedbackReplyFactsOf(q, notification);
    case "announcement":
    case "announcement_test":
      return announcementFactsOf(q, notification, kind);
    default:
      return noticeFactsOf(q, notification, kind);
  }
}

/**
 * An operator's action that affects the person, with its statement of
 * reasons (spec 9, R9.5), the answer to their appeal (3.4.4), or the end
 * of their suspension (3.6), which is dropped if they were suspended again
 * before it went out.
 */
async function noticeFactsOf(
  q: Queryable,
  notification: typeof notifications.$inferSelect,
  kind: "moderation_action" | "suspension_ended" | "appeal_answered",
) {
  const [row] = await q
    .select({
      locale: recipients.locale,
      email: recipients.email,
      emailVerifiedAt: recipients.emailVerifiedAt,
      status: recipients.status,
      action: moderationActions,
    })
    .from(recipients)
    .leftJoin(
      moderationActions,
      notification.moderationActionId === null
        ? sql`false`
        : eq(moderationActions.id, notification.moderationActionId),
    )
    .where(eq(recipients.id, notification.recipientId));
  if (row === undefined) return undefined;
  const { action } = row;
  let facts: AccountNoticeFacts;
  if (kind === "suspension_ended") {
    facts = { kind };
  } else if (action === null) {
    return undefined;
  } else if (kind === "appeal_answered") {
    if (action.appealOutcome === null || action.appealAnswer === null) return undefined;
    facts = {
      kind,
      outcome: action.appealOutcome as AppealOutcome,
      answer: action.appealAnswer,
    };
  } else {
    facts = {
      kind,
      action: action.kind as ModerationActionKind,
      rule: action.rule as ModerationRule | null,
      reason: action.reason,
      until: action.until,
      at: action.createdAt,
      content: action.contentKind as ModeratedContent | null,
    };
  }
  return {
    facts,
    current: kind !== "suspension_ended" || row.status === "active",
    locale: row.locale === "is" ? "is" : "en",
    recipientId: notification.recipientId,
    email: row.emailVerifiedAt === null ? null : row.email,
    phone: null,
    booking: null,
  } as const;
}

/** The operator's reply to the person's feedback (spec 12, 3.3.4). */
async function feedbackReplyFactsOf(q: Queryable, notification: typeof notifications.$inferSelect) {
  if (notification.feedbackId === null) return undefined;
  const [row] = await q
    .select({
      locale: recipients.locale,
      email: recipients.email,
      emailVerifiedAt: recipients.emailVerifiedAt,
      reply: feedback.reply,
      sentAt: feedback.createdAt,
    })
    .from(feedback)
    .innerJoin(recipients, eq(recipients.id, feedback.userId))
    .where(
      and(eq(feedback.id, notification.feedbackId), eq(feedback.userId, notification.recipientId)),
    );
  if (row === undefined || row.reply === null) return undefined;
  const facts: AccountNoticeFacts = {
    kind: "feedback_replied",
    sentAt: row.sentAt,
    reply: row.reply,
  };
  return {
    facts,
    current: true,
    locale: row.locale === "is" ? "is" : "en",
    recipientId: notification.recipientId,
    email: row.emailVerifiedAt === null ? null : row.email,
    phone: null,
    booking: null,
  } as const;
}

/**
 * An announcement in the person's language (spec 10, 3.5.3), dropped if
 * they turned "Beta news" off or left good standing before it went out;
 * or the operator's own copy of one, in both languages (3.5.2).
 */
async function announcementFactsOf(
  q: Queryable,
  notification: typeof notifications.$inferSelect,
  kind: "announcement" | "announcement_test",
) {
  if (notification.announcementId === null) return undefined;
  const [row] = await q
    .select({
      locale: recipients.locale,
      email: recipients.email,
      emailVerifiedAt: recipients.emailVerifiedAt,
      status: recipients.status,
      deleteAfter: recipients.deleteAfter,
      announcement: announcements,
    })
    .from(announcements)
    .innerJoin(recipients, eq(recipients.id, notification.recipientId))
    .where(eq(announcements.id, notification.announcementId));
  if (row === undefined) return undefined;
  const locale = row.locale === "is" ? "is" : "en";
  const { titleIs, titleEn, messageIs, messageEn } = row.announcement;
  const facts: AccountNoticeFacts =
    kind === "announcement_test"
      ? { kind, titleIs, titleEn, messageIs, messageEn }
      : {
          kind,
          title: locale === "is" ? titleIs : titleEn,
          message: locale === "is" ? messageIs : messageEn,
        };
  const current =
    kind === "announcement_test" ||
    (row.status === "active" &&
      row.deleteAfter === null &&
      (await preferencesOf(q, notification.recipientId)).betaNews);
  return {
    facts,
    current,
    locale,
    recipientId: notification.recipientId,
    email: row.emailVerifiedAt === null ? null : row.email,
    phone: null,
    booking: null,
  } as const;
}

/** The outcome of the person's report, in general terms (spec 9, 3.1.6). */
async function reportOutcomeFactsOf(q: Queryable, notification: typeof notifications.$inferSelect) {
  if (notification.reportId === null) return undefined;
  const [row] = await q
    .select({
      locale: recipients.locale,
      outcome: reports.outcome,
    })
    .from(recipients)
    .innerJoin(reports, eq(reports.id, notification.reportId))
    .where(eq(recipients.id, notification.recipientId));
  if (row === undefined || row.outcome === null) return undefined;
  const facts: AccountNoticeFacts = {
    kind: "report_closed",
    outcome: row.outcome as ReportOutcome,
  };
  return {
    facts,
    current: true,
    locale: row.locale === "is" ? "is" : "en",
    recipientId: notification.recipientId,
    email: null,
    phone: null,
    booking: null,
  } as const;
}

/**
 * For a data export (spec 11), until when the file can be downloaded:
 * `current` is false once the person's latest export cannot be downloaded
 * (it expired or failed, or a newer one was asked for, which deleted this
 * file). For a deletion, when the data is erased: `current` is false once
 * the person kept their account.
 */
async function exportFactsOf(
  q: Queryable,
  notification: typeof notifications.$inferSelect,
  kind: "data_export_ready" | "account_deletion_scheduled",
  now: Date,
) {
  const [row] = await q
    .select({
      locale: recipients.locale,
      email: recipients.email,
      emailVerifiedAt: recipients.emailVerifiedAt,
      deleteAfter: recipients.deleteAfter,
      readyAt: dataExports.readyAt,
      failedAt: dataExports.failedAt,
      expiresAt: dataExports.expiresAt,
      hasFile: sql<boolean>`${dataExports.file} is not null`,
    })
    .from(recipients)
    .leftJoin(dataExports, eq(dataExports.userId, recipients.id))
    .where(eq(recipients.id, notification.recipientId))
    .orderBy(desc(dataExports.askedAt))
    .limit(1);
  if (row === undefined) return undefined;
  let until: Date | null;
  let current: boolean;
  if (kind === "account_deletion_scheduled") {
    until = row.deleteAfter;
    current = until !== null && until > now;
  } else {
    until = row.expiresAt;
    current =
      row.readyAt !== null && row.failedAt === null && row.hasFile && until !== null && until > now;
  }
  const facts: AccountNoticeFacts = { kind, until: until ?? now };
  return {
    facts,
    current,
    locale: row.locale === "is" ? "is" : "en",
    recipientId: notification.recipientId,
    email: row.emailVerifiedAt === null ? null : row.email,
    phone: null,
    booking: null,
  } as const;
}

/**
 * A new report, to an operator (spec 9, R9.9): only whether it is about
 * safety. `current` is false once the report is closed, or the operator no
 * longer holds the role. A switch left off (spec 10, 3.3): the switches
 * that are off now, and nothing once all are on again.
 */
async function operatorFactsOf(
  q: Queryable,
  notification: typeof notifications.$inferSelect,
  switchesOff: SwitchesOff,
) {
  const kind = notification.kind as NotificationKind;
  if (!isOperatorNotice(kind)) return undefined;
  const aboutAReport = kind === "report_filed" || kind === "report_filed_urgent";
  if (aboutAReport && notification.reportId === null) return undefined;
  const [row] = await q
    .select({
      locale: recipients.locale,
      phone: recipients.phoneE164,
      phoneVerifiedAt: recipients.phoneVerifiedAt,
      email: recipients.email,
      emailVerifiedAt: recipients.emailVerifiedAt,
      roles: recipients.roles,
      status: recipients.status,
      deleteAfter: recipients.deleteAfter,
      reportStatus: reports.status,
    })
    .from(recipients)
    .leftJoin(reports, eq(reports.id, sql`${notification.reportId}::uuid`))
    .where(eq(recipients.id, notification.recipientId));
  if (row === undefined) return undefined;
  const common = {
    locale: row.locale === "is" ? "is" : "en",
    recipientId: notification.recipientId,
    phone: row.phoneVerifiedAt === null ? null : row.phone,
    booking: null,
  } as const;
  if (kind === "console_recovered") {
    // Told whether or not they still hold the role: it is about their account.
    const facts: OperatorNoticeFacts = { kind };
    return {
      ...common,
      facts,
      current: true,
      email: row.emailVerifiedAt === null ? null : row.email,
    } as const;
  }
  if (kind === "switch_still_off") {
    const off = await switchesOff();
    const facts: OperatorNoticeFacts = { kind, off };
    return {
      ...common,
      facts,
      current: off.length > 0 && canUseConsole(row),
      email: row.emailVerifiedAt === null ? null : row.email,
    } as const;
  }
  if (kind === "new_members") {
    // Only while the operator still wants it and may use the console (spec 25).
    const counted = await newMembersFactsOf(q, notification);
    const facts: OperatorNoticeFacts = {
      kind,
      count: counted?.count ?? 0,
      since: counted?.since ?? notification.createdAt,
      total: counted?.total ?? 0,
    };
    return {
      ...common,
      facts,
      current: counted !== null && counted.count > 0 && canUseConsole(row),
      email: row.emailVerifiedAt === null ? null : row.email,
    } as const;
  }
  const facts: OperatorNoticeFacts = { kind };
  return {
    ...common,
    facts,
    current: row.reportStatus === "open" && canUseConsole(row),
    email: null,
  } as const;
}

/**
 * The answer to a request about the person's data (spec 11, 3.6), with the
 * day it came: nothing once the request is no longer theirs (erased since).
 */
async function answerFactsOf(q: Queryable, notification: typeof notifications.$inferSelect) {
  if (notification.privacyRequestId === null) return undefined;
  const [row] = await q
    .select({
      locale: recipients.locale,
      email: recipients.email,
      emailVerifiedAt: recipients.emailVerifiedAt,
      receivedAt: privacyRequests.receivedAt,
      answer: privacyRequests.answer,
    })
    .from(privacyRequests)
    .innerJoin(recipients, eq(recipients.id, privacyRequests.userId))
    .where(
      and(
        eq(privacyRequests.id, notification.privacyRequestId),
        eq(privacyRequests.userId, notification.recipientId),
      ),
    );
  if (row === undefined || row.answer === null) return undefined;
  const facts: AccountNoticeFacts = {
    kind: "privacy_request_answered",
    receivedAt: row.receivedAt,
    answer: row.answer,
  };
  return {
    facts,
    current: true,
    locale: row.locale === "is" ? "is" : "en",
    recipientId: notification.recipientId,
    email: row.emailVerifiedAt === null ? null : row.email,
    phone: null,
    booking: null,
  } as const;
}

/** The kinds that ask for an answer to a report, with its deadline. */
const answerKinds: ReadonlySet<string> = new Set<NotificationKind>([
  "no_show_marked",
  "driver_absent_reported",
]);

/** What a notification's text is made from, and where it goes, as of now. */
async function factsOf(q: Queryable, notificationId: string, now: Date, switchesOff: SwitchesOff) {
  const [found] = await q.select().from(notifications).where(eq(notifications.id, notificationId));
  if (found === undefined) return undefined;
  if (isAccountNotice(found.kind as NotificationKind)) return accountFactsOf(q, found, now);
  if (isOperatorNotice(found.kind as NotificationKind)) {
    return operatorFactsOf(q, found, switchesOff);
  }
  if (
    found.kind === "meeting_point_changed_driver" ||
    found.kind === "meeting_point_moved_driver"
  ) {
    return pointNewsForDriverOf(q, found, now);
  }
  if (found.bookingId === null) return tripFactsOf(q, found);
  const [row] = await q
    .select({
      notification: notifications,
      booking: bookings,
      driverId: trips.driverId,
      arrivesAt: trips.arrivesAt,
      boardsAt: boards.plannedAt,
      boardPointId: boards.meetingPointId,
      boardRemovedAt: boards.removedAt,
      alightPointId: alights.meetingPointId,
      alightRemovedAt: alights.removedAt,
      alightsAt: alights.plannedAt,
      car: { make: vehicles.make, model: vehicles.model, colour: vehicles.colour },
      board: { is: boardPoint.nameIs, en: boardPoint.nameEn },
      alight: { is: alightPoint.nameIs, en: alightPoint.nameEn },
      recipient: {
        locale: recipients.locale,
        email: recipients.email,
        emailVerifiedAt: recipients.emailVerifiedAt,
        phone: recipients.phoneE164,
        phoneVerifiedAt: recipients.phoneVerifiedAt,
      },
      driverName: drivers.firstName,
      passengerName: passengers.firstName,
    })
    .from(notifications)
    .innerJoin(bookings, eq(bookings.id, notifications.bookingId))
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .innerJoin(boards, eq(boards.id, bookings.fromStopId))
    .innerJoin(alights, eq(alights.id, bookings.toStopId))
    .innerJoin(boardPoint, eq(boardPoint.id, boards.meetingPointId))
    .innerJoin(alightPoint, eq(alightPoint.id, alights.meetingPointId))
    .innerJoin(recipients, eq(recipients.id, notifications.recipientId))
    .innerJoin(drivers, eq(drivers.id, trips.driverId))
    .innerJoin(passengers, eq(passengers.id, bookings.passengerId))
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .where(eq(notifications.id, notificationId));
  if (row === undefined) return undefined;
  const { notification, booking, recipient } = row;
  if (row.boardsAt === null) throw new Error("A booked trip has the times of its stops.");
  // An erased sender's message is gone for the other person, even where a
  // report keeps what it said for the operator (A47).
  const [message] =
    notification.messageId === null
      ? []
      : await q
          .select()
          .from(messages)
          .where(and(eq(messages.id, notification.messageId), isNull(messages.erasedAt)));
  const locale = recipient.locale === "is" ? "is" : "en";
  const role: TripRole = notification.recipientId === row.driverId ? "driver" : "passenger";
  const moved =
    notification.tripChangeId === null
      ? undefined
      : await moveOf(q, notification.tripChangeId, booking.id);
  // Each notification of a new car or stop names its own, should another follow.
  const newCar =
    notification.tripChangeId === null ? undefined : await newCarOf(q, notification.tripChangeId);
  const newStop =
    notification.tripChangeId === null ? undefined : await newStopOf(q, notification.tripChangeId);
  const removedStop =
    notification.tripChangeId === null
      ? undefined
      : await removedStopOf(q, notification.tripChangeId);
  // A report asks the other side to answer by its deadline (spec 8, R8.6).
  const [report] = answerKinds.has(notification.kind) ? await disputesOf(q, [booking.id]) : [];
  // The booking still gets in or out at the point a meeting point's news is
  // about, and the trip has not got there yet: a retry after that says nothing.
  const stopsThere =
    notification.meetingPointId !== null &&
    ((row.boardPointId === notification.meetingPointId &&
      row.boardRemovedAt === null &&
      row.boardsAt > now) ||
      (row.alightPointId === notification.meetingPointId &&
        row.alightRemovedAt === null &&
        row.alightsAt !== null &&
        row.alightsAt > now));
  const facts: NotificationFacts = {
    kind: notification.kind as NotificationFacts["kind"],
    role,
    bookingId: booking.id,
    tripId: booking.tripId,
    name: (role === "driver" ? row.passengerName : row.driverName) ?? "",
    seats: booking.seats,
    total: { amount: booking.totalPrice, currency: "ISK" },
    cancelReason: booking.cancelReason as CancelReason | null,
    refund: { amount: booking.refundAmount ?? 0, currency: "ISK" },
    from: named(locale, row.board),
    to: named(locale, row.alight),
    boardsAt: row.boardsAt,
    requestExpiresAt: booking.expiresAt,
    paymentDueAt: booking.paymentDueAt,
    message:
      message === undefined
        ? null
        : message.kind === "text"
          ? { text: message.body ?? "" }
          : { quick: quickOf(message) },
    boardPointId: row.boardPointId,
    car: row.car === null ? null : { ...row.car, colour: row.car.colour as CarColour },
    newCar: newCar ?? null,
    newStop:
      newStop === undefined
        ? null
        : { name: named(locale, newStop.name), plannedAt: newStop.plannedAt },
    removedStop: removedStop === undefined ? null : { name: named(locale, removedStop.name) },
    moved: moved === undefined ? null : { from: moved.from, to: moved.to },
    // Paid to the driver in person, nothing was paid in the app (rule M6).
    paid:
      booking.status === "confirmed" &&
      paidInApp({ amount: booking.totalPrice, currency: "ISK" }, methodOf(booking)).amount > 0,
    answerBy:
      report === undefined || row.arrivesAt === null
        ? null
        : answerByOf(report, row.arrivesAt, defaultTripDaySettings),
    // Only while the booking still gets in or out there: after the driver
    // chose another stop, the news names a point the passenger no longer uses.
    pausedPoint:
      notification.kind === "meeting_point_changed" && stopsThere
        ? await pausedPointOf(q, notification.meetingPointId, locale)
        : null,
    movedPoint:
      notification.kind === "meeting_point_moved" && stopsThere
        ? await movedPointOf(q, notification.meetingPointId, locale)
        : null,
  };
  return {
    facts,
    locale,
    recipientId: notification.recipientId,
    email: recipient.emailVerifiedAt === null ? null : recipient.email,
    phone: recipient.phoneVerifiedAt === null ? null : recipient.phone,
    // ShareRide removed it before it went out (spec 9, 3.4.3).
    messageRemoved: message !== undefined && message.hiddenAt !== null,
    booking: {
      status: booking.status as BookingStatus,
      requestExpiresAt: booking.expiresAt,
      paymentDueAt: booking.paymentDueAt,
    },
  } as const;
}

/** What a push did to the device's tokens: tickets to ask about later, and tokens gone. */
interface PushOutcome {
  readonly tickets: readonly { readonly id: string; readonly tokenId: string }[];
  readonly gone: readonly string[];
}

type SendResult =
  { readonly ref: string; readonly push?: PushOutcome } | { readonly skipped: string };

export function createNotificationWorker(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly push: PushSender;
  /**
   * The email provider (ADR 0027), and the web app its links open. Without
   * it, email is skipped as `email_off` (`EMAIL_PROVIDER=none`).
   */
  readonly email?: EmailChannel;
  readonly settings?: NotificationSettings;
  /** The time to review and its reminder (spec 8, 3.7). */
  readonly reviewSettings?: ReviewSettings;
  /**
   * Text messages for last-minute news (spec 7, 3.4; ADR 0023). Without
   * it, SMS is skipped as `sms_off`.
   */
  readonly sms?: SmsSender;
  /** A send that failed, for the logs: never the text or the address. */
  readonly onSendError?: (error: unknown, delivery: { id: string; channel: string }) => void;
  /**
   * An event that could not be turned into notifications, for the logs: its
   * ID and kind only. `givenUp` once it has failed `eventAttempts` times.
   */
  readonly onEventError?: (
    error: unknown,
    event: { id: string; kind: string; givenUp: boolean },
  ) => void;
  /**
   * The operator's switches (spec 10, 3.3): a channel that is off leaves
   * its messages waiting, and a switch left off reminds the operators.
   * Without it, every switch is on.
   */
  readonly switches?: () => Promise<WorkerSwitches>;
}): NotificationWorker {
  const { db, clock, push, email, sms, onSendError, onEventError } = dependencies;
  const switchesNow = async (): Promise<Partial<WorkerSwitches>> =>
    (await dependencies.switches?.()) ?? {};
  const switchesOff: SwitchesOff = async () => {
    const now = await switchesNow();
    return switchKeys.filter((key) => now[key]?.on === false);
  };
  /** The sending channels with their switches, as the deliveries name them. */
  const channels = Object.entries(channelSwitches) as [keyof typeof channelSwitches, SwitchKey][];
  const settings = dependencies.settings ?? defaultNotificationSettings;
  const reviewSettings = dependencies.reviewSettings ?? defaultReviewSettings;

  /**
   * When the passenger gets in, for the SMS window: for a moved departure,
   * the earlier of the old and the new time, so the window is never missed.
   */
  async function boardingFor(
    q: Queryable,
    bookingId: string,
    tripChangeId: string | null,
  ): Promise<Date | null> {
    const moved = tripChangeId === null ? undefined : await moveOf(q, tripChangeId, bookingId);
    if (moved !== undefined) return moved.from < moved.to ? moved.from : moved.to;
    return (await timesOf(q, bookingId))?.boardsAt ?? null;
  }

  /**
   * What the catalogue needs to know about a person to pick the channels:
   * for a passenger's booking, when they get in, for the SMS window.
   */
  async function recipientOf(
    q: Queryable,
    userId: string,
    role: TripRole | null,
    bookingId: string | null,
    now: Date,
    tripChangeId: string | null = null,
  ): Promise<Recipient> {
    const [user] = await q
      .select({
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        phoneVerifiedAt: users.phoneVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, userId));
    const tokens = await tokensOf(q, userId);
    return {
      role,
      hasPushDevice: tokens.length > 0,
      hasVerifiedEmail: (user?.email ?? null) !== null && (user?.emailVerifiedAt ?? null) !== null,
      hasVerifiedPhone: (user?.phoneVerifiedAt ?? null) !== null,
      boardsAt:
        role === "passenger" && bookingId !== null
          ? await boardingFor(q, bookingId, tripChangeId)
          : null,
      smsSentToday: await smsSince(q, userId, startOfIcelandDay(now)),
    };
  }

  /**
   * SMS news to the person since `since`, sent, on its way, or interrupted
   * after it may have gone (R7.10). Two events for one person at the same
   * moment can each count before the other is stored, so the limit can be
   * passed by one; rare, and it never sends anything twice.
   */
  async function smsSince(q: Queryable, userId: string, since: Date): Promise<number> {
    const [row] = await q
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationDeliveries)
      .innerJoin(notifications, eq(notifications.id, notificationDeliveries.notificationId))
      .where(
        and(
          eq(notifications.recipientId, userId),
          eq(notificationDeliveries.channel, "sms"),
          // An operator's alerts have no limit, and take nothing from it (R9.9).
          notInArray(notifications.kind, [...operatorNoticeKinds]),
          or(
            inArray(notificationDeliveries.status, ["queued", "sending", "sent"]),
            and(
              eq(notificationDeliveries.status, "failed"),
              eq(notificationDeliveries.reason, "interrupted"),
            ),
          ),
          gt(notificationDeliveries.createdAt, since),
        ),
      );
    return row?.count ?? 0;
  }

  function deliveryOf(notificationId: string, decision: ChannelDecision, now: Date) {
    const base = { notificationId, channel: decision.channel, createdAt: now, updatedAt: now };
    if (!decision.send) return { ...base, status: "skipped", reason: decision.reason };
    if (decision.channel === "email" && email === undefined) {
      return { ...base, status: "skipped", reason: "email_off" };
    }
    if (decision.channel === "sms" && sms === undefined) {
      return { ...base, status: "skipped", reason: "sms_off" };
    }
    return { ...base, status: "queued", nextAttemptAt: now };
  }

  /**
   * The event's notifications, one per person, each with a delivery per
   * channel. A notification made by an earlier run has the same key, so
   * nothing is added the second time.
   */
  async function notify(
    tx: Transaction,
    event: NotificationEvent,
    booking: Parties,
    source: { readonly key: string; readonly messageId?: string; readonly tripChangeId?: string },
    now: Date,
  ): Promise<void> {
    for (const { kind, to } of notificationsFor(event)) {
      const recipientId = to === "driver" ? booking.driverId : booking.passengerId;
      await add(
        tx,
        {
          kind,
          to,
          recipientId,
          bookingId: booking.id,
          messageId: source.messageId ?? null,
          tripChangeId: source.tripChangeId ?? null,
        },
        source.key,
        now,
      );
    }
  }

  /** One notification with its deliveries, unless an earlier run made it. */
  async function add(
    tx: Transaction,
    notification: {
      readonly kind: NotificationKind;
      /** Null for news about the account. */
      readonly to: TripRole | null;
      readonly recipientId: string;
      readonly bookingId?: string;
      readonly tripId?: string;
      readonly messageId?: string | null;
      readonly tripChangeId?: string | null;
      readonly reportId?: string;
      readonly moderationActionId?: string;
      readonly privacyRequestId?: string;
      readonly feedbackId?: string;
      readonly announcementId?: string;
      readonly meetingPointId?: string;
    },
    key: string,
    now: Date,
  ): Promise<void> {
    const { kind, to, recipientId } = notification;
    const [created] = await tx
      .insert(notifications)
      .values({
        recipientId,
        kind,
        bookingId: notification.bookingId ?? null,
        tripId: notification.tripId ?? null,
        messageId: notification.messageId ?? null,
        tripChangeId: notification.tripChangeId ?? null,
        reportId: notification.reportId ?? null,
        moderationActionId: notification.moderationActionId ?? null,
        privacyRequestId: notification.privacyRequestId ?? null,
        feedbackId: notification.feedbackId ?? null,
        announcementId: notification.announcementId ?? null,
        meetingPointId: notification.meetingPointId ?? null,
        uniqueKey: `${key}:${kind}:${recipientId}`,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    if (created === undefined) return;
    const recipient = await recipientOf(
      tx,
      recipientId,
      to,
      notification.bookingId ?? null,
      now,
      notification.tripChangeId ?? null,
    );
    const decisions = channelsFor(kind, recipient, now, settings);
    if (decisions.length === 0) return;
    await tx
      .insert(notificationDeliveries)
      .values(decisions.map((decision) => deliveryOf(created.id, decision, now)));
  }

  /**
   * The trip reminders a confirmed booking leads to (3.5): the passenger's,
   * keyed by booking, from their boarding time; the driver's, keyed by trip,
   * from the departure, made by the first booking confirmed. One whose
   * moment had passed when the booking was confirmed is skipped.
   */
  async function scheduleReminders(
    tx: Transaction,
    booking: Parties,
    confirmedAt: Date,
    now: Date,
  ): Promise<void> {
    await holdTrip(tx, booking.tripId);
    const times = await timesOf(tx, booking.id);
    if (times === undefined) return;
    const rows: (typeof scheduledNotifications.$inferInsert)[] = [];
    if (times.boardsAt !== null) {
      for (const { which, at } of reminderTimes(
        { startsAt: times.boardsAt, since: confirmedAt },
        settings,
      )) {
        const kind = which === "evening" ? "reminder_evening" : "reminder_hour";
        rows.push({ key: `${kind}:${booking.id}`, kind, bookingId: booking.id, runAt: at });
      }
    }
    if (times.departsAt !== null) {
      for (const { which, at } of reminderTimes(
        { startsAt: times.departsAt, since: confirmedAt },
        settings,
      )) {
        const kind = which === "evening" ? "reminder_evening_driver" : "reminder_hour_driver";
        rows.push({ key: `${kind}:${booking.tripId}`, kind, tripId: booking.tripId, runAt: at });
      }
    }
    if (rows.length === 0) return;
    await tx
      .insert(scheduledNotifications)
      .values(rows.map((row) => ({ ...row, createdAt: now, updatedAt: now })))
      .onConflictDoNothing();
  }

  /** When the booking's passenger gets in, and when its trip leaves. */
  async function timesOf(q: Queryable, bookingId: string) {
    const [times] = await q
      .select({ boardsAt: tripStops.plannedAt, departsAt: trips.departsAt })
      .from(bookings)
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .innerJoin(tripStops, eq(tripStops.id, bookings.fromStopId))
      .where(eq(bookings.id, bookingId));
    return times;
  }

  /** Whether anyone's booking on the trip is still confirmed. */
  async function anyoneBooked(q: Queryable, tripId: string): Promise<boolean> {
    const [found] = await q
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.tripId, tripId), eq(bookings.status, "confirmed")))
      .limit(1);
    return found !== undefined;
  }

  /**
   * Waits for a move of the trip's departure that is being saved, and keeps
   * the next one until this transaction ends, so reminders are worked out
   * from the times as they are, and a move finds them to move (spec 6, 3.2).
   */
  async function holdTrip(tx: Transaction, tripId: string): Promise<void> {
    await tx.select({ id: trips.id }).from(trips).where(eq(trips.id, tripId)).for("share");
  }

  /** The halfway and pay reminders that follow a request and an acceptance. */
  async function scheduleAfter(
    tx: Transaction,
    type: OutboxEventType,
    parties: Parties,
    now: Date,
  ): Promise<void> {
    // The deadlines as they are once no move is being saved.
    await holdTrip(tx, parties.tripId);
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, parties.id));
    if (booking === undefined) return;
    const schedule = (kind: "request_halfway" | "pay_reminder", runAt: Date) =>
      tx
        .insert(scheduledNotifications)
        .values({
          key: `${kind}:${booking.id}`,
          kind,
          bookingId: booking.id,
          runAt,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
    const { status, requestedAt, expiresAt, decidedAt, paymentDueAt } = booking;
    if (
      type === "BookingRequested" &&
      status === "requested" &&
      requestedAt !== null &&
      expiresAt !== null
    ) {
      await schedule("request_halfway", requestHalfwayAt({ requestedAt, expiresAt }));
    }
    if (
      type === "BookingAccepted" &&
      status === "accepted" &&
      decidedAt !== null &&
      paymentDueAt !== null
    ) {
      const at = payReminderAt({ acceptedAt: decidedAt, dueAt: paymentDueAt }, settings);
      if (at !== null) await schedule("pay_reminder", at);
    }
  }

  /**
   * When the email about unread messages may go to the driver or the
   * passenger (3.6, item 3): 15 minutes after the oldest message from the
   * other person they have not read, and an hour after the last such email
   * about the booking. Messages that email already told of are not counted
   * again; none left to tell of gives null. (A message stored just after an
   * email was made, but written before it, counts as told of: the email
   * came as it arrived, and opening the chat shows it.)
   */
  async function unreadEmailAt(q: Queryable, booking: Parties, to: TripRole): Promise<Date | null> {
    const recipientId = to === "driver" ? booking.driverId : booking.passengerId;
    const [last] = await q
      .select({ at: notifications.createdAt })
      .from(notifications)
      .where(
        and(
          eq(notifications.bookingId, booking.id),
          eq(notifications.recipientId, recipientId),
          eq(notifications.kind, "unread_messages"),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(1);
    const lastSummaryAt = last?.at ?? null;
    const [oldest] = await q
      .select({ sentAt: messages.sentAt })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(
        and(
          eq(conversations.bookingId, booking.id),
          // The other person's: never one's own, nor a system line (no sender).
          ne(messages.senderId, recipientId),
          isNull(messages.readAt),
          lastSummaryAt === null ? undefined : gt(messages.sentAt, lastSummaryAt),
        ),
      )
      .orderBy(asc(messages.sentAt))
      .limit(1);
    if (oldest === undefined) return null;
    return unreadSummaryAt({ sentAt: oldest.sentAt, lastSummaryAt }, settings);
  }

  /** Whether the other person's messages in the booking's chat are not all read. */
  async function anyUnread(q: Queryable, bookingId: string, recipientId: string) {
    const [unread] = await q
      .select({ id: messages.id })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(
        and(
          eq(conversations.bookingId, bookingId),
          ne(messages.senderId, recipientId),
          isNull(messages.readAt),
        ),
      )
      .limit(1);
    return unread !== undefined;
  }

  /**
   * The email about unread messages that a chat message may lead to. One
   * already waiting for the booking and reader covers this message too: the
   * unique index on waiting ones makes the insert do nothing, and waits for
   * a worker that is taking that one, so this message is never left out.
   * Its moment is worked out again when it comes.
   */
  async function scheduleUnread(
    tx: Transaction,
    booking: Parties,
    to: TripRole,
    messageId: string,
    now: Date,
  ): Promise<void> {
    const runAt = await unreadEmailAt(tx, booking, to);
    if (runAt === null) return;
    await tx
      .insert(scheduledNotifications)
      .values({
        key: `unread_messages:${booking.id}:${to}:${messageId}`,
        kind: "unread_messages",
        bookingId: booking.id,
        recipient: to,
        runAt,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }

  /**
   * A paused meeting point (spec 2, 3.6.4), for one trip still to stop
   * there: its driver is asked to choose another stop, and each passenger
   * whose accepted or confirmed booking gets in or out there is told, once
   * each. Back in use since, or the trip over or the stop gone: nobody.
   * Retired while paused: told all the same, as the trip needs another stop.
   * A point moved more than 50 m (3.6.6) is told to the same people, while
   * the trip is still to stop there.
   */
  async function tellOfPointNews(
    tx: Transaction,
    news: "paused" | "moved",
    payload: Readonly<Record<string, string>>,
    key: string,
    now: Date,
  ): Promise<void> {
    const tripId = idIn(payload, "tripId");
    const meetingPointId = idIn(payload, "meetingPointId");
    if (tripId === undefined || meetingPointId === undefined) return;
    const [stop] = await tx
      .select({
        driverId: trips.driverId,
        status: meetingPoints.status,
        reasonIs: meetingPoints.pauseReasonIs,
      })
      .from(tripStops)
      .innerJoin(trips, eq(trips.id, tripStops.tripId))
      .innerJoin(meetingPoints, eq(meetingPoints.id, tripStops.meetingPointId))
      .where(
        and(
          eq(tripStops.tripId, tripId),
          eq(tripStops.meetingPointId, meetingPointId),
          isNull(tripStops.removedAt),
          gt(tripStops.plannedAt, now),
          inArray(trips.status, ["published", "departed"]),
        ),
      );
    if (
      stop === undefined ||
      (news === "paused" &&
        !pauseStillApplies(stop.status as MeetingPointStatus, stop.reasonIs !== null))
    ) {
      return;
    }
    const kinds =
      news === "paused"
        ? ({ driver: "meeting_point_changed_driver", passenger: "meeting_point_changed" } as const)
        : ({ driver: "meeting_point_moved_driver", passenger: "meeting_point_moved" } as const);
    await add(
      tx,
      {
        kind: kinds.driver,
        to: "driver",
        recipientId: stop.driverId,
        tripId,
        meetingPointId,
      },
      key,
      now,
    );
    const booked = await tx
      .select({ id: bookings.id, passengerId: bookings.passengerId })
      .from(bookings)
      .innerJoin(boards, eq(boards.id, bookings.fromStopId))
      .innerJoin(alights, eq(alights.id, bookings.toStopId))
      .where(
        and(
          eq(bookings.tripId, tripId),
          inArray(bookings.status, ["accepted", "confirmed"]),
          or(eq(boards.meetingPointId, meetingPointId), eq(alights.meetingPointId, meetingPointId)),
        ),
      )
      .orderBy(asc(bookings.createdAt), asc(bookings.id));
    for (const booking of booked) {
      // A passenger with two such bookings on the trip is told once: the key is per person.
      await add(
        tx,
        {
          kind: kinds.passenger,
          to: "passenger",
          recipientId: booking.passengerId,
          bookingId: booking.id,
          meetingPointId,
        },
        key,
        now,
      );
    }
  }

  /**
   * "How was your trip?" once a booking completes (spec 8, 3.7.6): the
   * passenger about their booking, and the driver once for the trip, each
   * only with trip reminders on and never about a person who has left or is
   * leaving, whom nobody can review. Then one reminder each, 3 days after
   * completion, unless that moment has passed. A ride the operator finds
   * happened after the 14 days asks nobody: it can no longer be reviewed.
   */
  async function askForReviews(
    tx: Transaction,
    booking: Parties,
    key: string,
    now: Date,
  ): Promise<void> {
    if (booking.status !== "completed" || booking.completedAt === null) return;
    if (now >= reviewClosesAt(booking.completedAt, reviewSettings)) return;
    const people = await tx
      .select({ id: users.id, deleteAfter: users.deleteAfter })
      .from(users)
      .where(inArray(users.id, [booking.passengerId, booking.driverId]));
    const stays = (id: string) => {
      const person = people.find((row) => row.id === id);
      return person !== undefined && !isHidden(person);
    };
    if (stays(booking.driverId) && (await preferencesOf(tx, booking.passengerId)).reminders) {
      await notify(tx, { type: "RateTrip", to: "passenger" }, booking, { key }, now);
    }
    if (stays(booking.passengerId) && (await preferencesOf(tx, booking.driverId)).reminders) {
      await add(
        tx,
        {
          kind: "rate_trip_driver",
          to: "driver",
          recipientId: booking.driverId,
          bookingId: booking.id,
        },
        `trip-completed:${booking.tripId}`,
        now,
      );
    }
    const runAt = reviewReminderAt(booking.completedAt, now, reviewSettings);
    if (runAt === null) return;
    const base = { runAt, createdAt: now, updatedAt: now };
    await tx
      .insert(scheduledNotifications)
      .values([
        {
          ...base,
          key: `rate_trip:${booking.id}`,
          kind: "rate_trip",
          bookingId: booking.id,
          recipient: "passenger",
        },
        {
          ...base,
          key: `rate_trip_driver:${booking.tripId}`,
          kind: "rate_trip_driver",
          tripId: booking.tripId,
          recipient: "driver",
        },
      ])
      .onConflictDoNothing();
  }

  /**
   * The one reminder to review (3.7.6): the passenger's while their booking
   * is completed, not reviewed by them, with no open report, the 14 days
   * not over and the driver still here; the driver's while one passenger of
   * the trip is so, about the first of them. Only with trip reminders on.
   */
  async function remindToReview(
    tx: Transaction,
    scheduled: typeof scheduledNotifications.$inferSelect,
    key: string,
    now: Date,
  ): Promise<void> {
    const forDriver = scheduled.kind === "rate_trip_driver";
    const which = forDriver
      ? scheduled.tripId === null
        ? undefined
        : eq(bookings.tripId, scheduled.tripId)
      : scheduled.bookingId === null
        ? undefined
        : eq(bookings.id, scheduled.bookingId);
    if (which === undefined) return;
    const subject = alias(users, "subject");
    const waiting = await tx
      .select({
        id: bookings.id,
        passengerId: bookings.passengerId,
        driverId: trips.driverId,
        completedAt: bookings.completedAt,
      })
      .from(bookings)
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .leftJoin(
        reviews,
        and(
          eq(reviews.bookingId, bookings.id),
          eq(reviews.authorId, forDriver ? trips.driverId : bookings.passengerId),
        ),
      )
      .leftJoin(disputes, and(eq(disputes.bookingId, bookings.id), isNull(disputes.outcome)))
      .innerJoin(subject, eq(subject.id, forDriver ? bookings.passengerId : trips.driverId))
      .where(
        and(
          which,
          eq(bookings.status, "completed"),
          isNull(reviews.id),
          isNull(disputes.id),
          shown(subject),
        ),
      )
      .orderBy(asc(bookings.completedAt), asc(bookings.id));
    const open = waiting.find(
      (row) => row.completedAt !== null && now < reviewClosesAt(row.completedAt, reviewSettings),
    );
    if (open === undefined) return;
    const recipientId = forDriver ? open.driverId : open.passengerId;
    if (!(await preferencesOf(tx, recipientId)).reminders) return;
    await add(
      tx,
      forDriver
        ? { kind: "rate_trip_driver", to: "driver", recipientId, bookingId: open.id }
        : { kind: "rate_trip", to: "passenger", recipientId, bookingId: open.id },
      key,
      now,
    );
  }

  async function handleEvent(
    tx: Transaction,
    event: typeof outboxEvents.$inferSelect,
    now: Date,
  ): Promise<void> {
    const type = event.kind as OutboxEventType;
    const key = `event:${event.id}`;
    if (type === "ConsoleRecovered") {
      // The operator whose recovery code was used (spec 22, R22.4).
      const userId = idIn(event.payload, "userId");
      if (userId === undefined) return;
      const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
      if (user === undefined) return;
      await add(tx, { kind: "console_recovered", to: null, recipientId: userId }, key, now);
      return;
    }
    if (type === "DataExportReady" || type === "AccountDeletionScheduled") {
      const userId = idIn(event.payload, "userId");
      if (userId === undefined) return;
      // Gone with the account in the meantime: nobody to tell.
      const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
      if (user === undefined) return;
      const kind = type === "DataExportReady" ? "data_export_ready" : "account_deletion_scheduled";
      await add(tx, { kind, to: null, recipientId: userId }, key, now);
      return;
    }
    if (type === "ModerationActionTaken") {
      // The person's notice (spec 9, R9.5); nobody, once their account is gone.
      const actionId = idIn(event.payload, "actionId");
      if (actionId === undefined) return;
      const [action] = await tx
        .select({ userId: moderationActions.userId })
        .from(moderationActions)
        .where(eq(moderationActions.id, actionId));
      if (action === undefined || action.userId === null) return;
      await add(
        tx,
        {
          kind: "moderation_action",
          to: null,
          recipientId: action.userId,
          moderationActionId: actionId,
        },
        key,
        now,
      );
      return;
    }
    if (type === "SuspensionEnded") {
      const userId = idIn(event.payload, "userId");
      if (userId === undefined) return;
      const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
      if (user === undefined) return;
      await add(tx, { kind: "suspension_ended", to: null, recipientId: userId }, key, now);
      return;
    }
    if (type === "AppealAnswered") {
      // The answer to the person's appeal (spec 9, 3.4.4); nobody, once their account is gone.
      const actionId = idIn(event.payload, "actionId");
      if (actionId === undefined) return;
      const [action] = await tx
        .select({ userId: moderationActions.userId })
        .from(moderationActions)
        .where(eq(moderationActions.id, actionId));
      if (action === undefined || action.userId === null) return;
      await add(
        tx,
        {
          kind: "appeal_answered",
          to: null,
          recipientId: action.userId,
          moderationActionId: actionId,
        },
        key,
        now,
      );
      return;
    }
    if (type === "ReportClosed") {
      // The reporter, in general terms (spec 9, 3.1.6); nobody, once their account is gone.
      const reportId = idIn(event.payload, "reportId");
      if (reportId === undefined) return;
      const [report] = await tx
        .select({ reporterId: reports.reporterId })
        .from(reports)
        .where(eq(reports.id, reportId));
      if (report === undefined || report.reporterId === null) return;
      await add(
        tx,
        { kind: "report_closed", to: null, recipientId: report.reporterId, reportId },
        key,
        now,
      );
      return;
    }
    if (type === "FeedbackReplied") {
      // The tester, with the reply (spec 12, 3.3.4); nobody, once the feedback is gone.
      const feedbackId = idIn(event.payload, "feedbackId");
      if (feedbackId === undefined) return;
      const [sent] = await tx
        .select({ userId: feedback.userId })
        .from(feedback)
        .where(eq(feedback.id, feedbackId));
      if (sent === undefined) return;
      await add(
        tx,
        { kind: "feedback_replied", to: null, recipientId: sent.userId, feedbackId },
        key,
        now,
      );
      return;
    }
    if (type === "AnnouncementSent") {
      // Everyone it is for now (spec 10, 3.5.3). Keyed by the announcement
      // and the person, so nobody is told twice whatever runs twice.
      const announcementId = idIn(event.payload, "announcementId");
      if (announcementId === undefined) return;
      const [sent] = await tx
        .select({ audience: announcements.audience, corridorId: announcements.corridorId })
        .from(announcements)
        .where(and(eq(announcements.id, announcementId), isNotNull(announcements.sentAt)));
      if (sent === undefined) return;
      for (const reader of await announcementReaders(tx, sent)) {
        await add(
          tx,
          { kind: "announcement", to: null, recipientId: reader.id, announcementId },
          `announcement:${announcementId}`,
          now,
        );
      }
      return;
    }
    if (type === "AnnouncementTested") {
      // The operator who asked, each time they ask (3.5.2).
      const announcementId = idIn(event.payload, "announcementId");
      const operatorId = idIn(event.payload, "operatorId");
      if (announcementId === undefined || operatorId === undefined) return;
      const [draft] = await tx
        .select({ id: announcements.id })
        .from(announcements)
        .where(eq(announcements.id, announcementId));
      if (draft === undefined) return;
      await add(
        tx,
        { kind: "announcement_test", to: null, recipientId: operatorId, announcementId },
        key,
        now,
      );
      return;
    }
    if (type === "ReportFiled") {
      // Every operator, at once (R9.9); a report closed or deleted since tells nobody.
      const reportId = idIn(event.payload, "reportId");
      if (reportId === undefined) return;
      const [report] = await tx
        .select({ urgent: reports.urgent })
        .from(reports)
        .where(and(eq(reports.id, reportId), eq(reports.status, "open")));
      if (report === undefined) return;
      const operators = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.status, "active"), sql`${users.roles} @> array[${operatorRole}]::text[]`),
        );
      const kind = report.urgent ? "report_filed_urgent" : "report_filed";
      for (const operator of operators) {
        await add(tx, { kind, to: null, recipientId: operator.id, reportId }, key, now);
      }
      return;
    }
    if (type === "PrivacyRequestAnswered") {
      const userId = idIn(event.payload, "userId");
      const requestId = idIn(event.payload, "requestId");
      if (userId === undefined || requestId === undefined) return;
      // Still the person's: an erasure in the meantime moved it to the former member.
      const [request] = await tx
        .select({ id: privacyRequests.id })
        .from(privacyRequests)
        .where(and(eq(privacyRequests.id, requestId), eq(privacyRequests.userId, userId)));
      if (request === undefined) return;
      await add(
        tx,
        {
          kind: "privacy_request_answered",
          to: null,
          recipientId: userId,
          privacyRequestId: requestId,
        },
        key,
        now,
      );
      return;
    }
    if (type === "MeetingPointChanged" || type === "MeetingPointMoved") {
      await tellOfPointNews(
        tx,
        type === "MeetingPointChanged" ? "paused" : "moved",
        event.payload,
        key,
        now,
      );
      return;
    }
    if (type === "MessageSent") {
      const messageId = idIn(event.payload, "messageId");
      if (messageId === undefined) return;
      const [found] = await tx
        .select({ bookingId: conversations.bookingId, senderId: messages.senderId })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .where(eq(messages.id, messageId));
      // Gone with its conversation, or a system line, which tells nobody.
      if (found === undefined || found.senderId === null) return;
      const booking = await partiesOf(tx, found.bookingId);
      if (booking === undefined) return;
      const to = found.senderId === booking.driverId ? "passenger" : "driver";
      await notify(tx, { type, to }, booking, { key, messageId }, now);
      await scheduleUnread(tx, booking, to, messageId, now);
      return;
    }
    const bookingId = idIn(event.payload, "bookingId");
    const booking = bookingId === undefined ? undefined : await partiesOf(tx, bookingId);
    // A booking deleted since, with its account, tells nobody.
    if (booking === undefined) return;
    if (type === "DepartureMoved") {
      const tripChangeId = idIn(event.payload, "tripChangeId");
      const moved =
        tripChangeId === undefined ? undefined : await moveOf(tx, tripChangeId, booking.id);
      if (tripChangeId === undefined || moved === undefined) return;
      await notify(
        tx,
        { type, byMinutes: moved.byMinutes, far: moved.far },
        booking,
        { key, tripChangeId },
        now,
      );
      return;
    }
    if (type === "TripChanged") {
      // A new car, or a stop added or removed; anything else tells nobody
      // until it has its words.
      const tripChangeId = idIn(event.payload, "tripChangeId");
      if (tripChangeId === undefined) return;
      const told =
        (await newCarOf(tx, tripChangeId)) !== undefined ||
        (await newStopOf(tx, tripChangeId)) !== undefined ||
        (await removedStopOf(tx, tripChangeId)) !== undefined;
      if (!told) return;
      await notify(tx, { type }, booking, { key, tripChangeId }, now);
      return;
    }
    if (type === "BookingCompleted") {
      await askForReviews(tx, booking, key, now);
      return;
    }
    if (type === "ReviewRevealed") {
      const reviewId = idIn(event.payload, "reviewId");
      if (reviewId === undefined) return;
      const [shown] = await tx
        .select({ authorRole: reviews.authorRole, hiddenAt: reviews.hiddenAt })
        .from(reviews)
        .where(eq(reviews.id, reviewId));
      // Removed since with the booking's reviews, or hidden by the operator.
      if (shown === undefined || shown.hiddenAt !== null) return;
      const about = shown.authorRole === "passenger" ? "driver" : "passenger";
      await notify(tx, { type, about }, booking, { key }, now);
      return;
    }
    const happened: NotificationEvent =
      type === "BookingExpired"
        ? { type, reason: event.payload["reason"] === "unpaid" ? "unpaid" : "unanswered" }
        : type === "BookingCancelled"
          ? { type, by: cancelledBy(event.payload) }
          : type === "CheckedIn"
            ? { type, by: doneBy(event.payload, type) }
            : { type };
    await notify(tx, happened, booking, { key }, now);
    await scheduleAfter(tx, type, booking, now);
    if (type === "BookingConfirmed") await scheduleReminders(tx, booking, event.createdAt, now);
  }

  /**
   * Step 1: the oldest events become notifications, in one transaction. Each
   * event has its own savepoint: one that fails is tried again on the next
   * runs and given up after `eventAttempts`, and never holds back the rest.
   */
  function takeEvents(): Promise<number> {
    return db.transaction(async (tx) => {
      const now = clock();
      const due = await tx
        .select()
        .from(outboxEvents)
        .where(isNull(outboxEvents.processedAt))
        .orderBy(asc(outboxEvents.createdAt), asc(outboxEvents.id))
        .limit(batchSize)
        .for("update", { skipLocked: true });
      const done: string[] = [];
      for (const event of due) {
        try {
          await tx.transaction((savepoint) => handleEvent(savepoint, event, now));
          done.push(event.id);
        } catch (error) {
          const givenUp = event.attempts + 1 >= eventAttempts;
          await tx
            .update(outboxEvents)
            .set({
              attempts: event.attempts + 1,
              ...(givenUp ? { processedAt: now, failedAt: now } : {}),
              updatedAt: now,
            })
            .where(eq(outboxEvents.id, event.id));
          onEventError?.(error, { id: event.id, kind: event.kind, givenUp });
        }
      }
      if (done.length > 0) {
        await tx
          .update(outboxEvents)
          .set({ processedAt: now, updatedAt: now })
          .where(inArray(outboxEvents.id, done));
      }
      return done.length;
    });
  }

  /** What a scheduled notification gives if it still applies at its moment. */
  function stillDue(kind: string, booking: Parties, now: Date): NotificationEvent | null {
    const status = statusAt(
      {
        status: booking.status as BookingStatus,
        requestExpiresAt: booking.expiresAt,
        paymentDueAt: booking.paymentDueAt,
      },
      now,
    );
    if (kind === "request_halfway" && stillApplies(kind, status)) return { type: "RequestHalfway" };
    if (kind === "pay_reminder" && stillApplies(kind, status)) return { type: "PaymentDueSoon" };
    if ((kind === "reminder_evening" || kind === "reminder_hour") && stillApplies(kind, status)) {
      return { type: "ReminderDue", which: passengerReminders[kind], to: "passenger" };
    }
    return null;
  }

  /** Whether a passenger's reminder is not late and their reminders are on. */
  async function reminderGoes(
    q: Queryable,
    event: Extract<NotificationEvent, { type: "ReminderDue" }>,
    booking: Parties,
    now: Date,
  ): Promise<boolean> {
    const times = await timesOf(q, booking.id);
    if (times === undefined || times.boardsAt === null) return false;
    if (!reminderStillTimely({ which: event.which, startsAt: times.boardsAt }, now)) return false;
    return (await preferencesOf(q, booking.passengerId)).reminders;
  }

  /** A driver's trip reminder, if not late, someone is still booked and reminders are on. */
  async function remindDriver(
    tx: Transaction,
    kind: keyof typeof driverReminders,
    tripId: string,
    key: string,
    now: Date,
  ): Promise<void> {
    const [trip] = await tx
      .select({ driverId: trips.driverId, departsAt: trips.departsAt })
      .from(trips)
      .where(eq(trips.id, tripId));
    if (trip === undefined || trip.departsAt === null) return;
    const which = driverReminders[kind];
    if (!reminderStillTimely({ which, startsAt: trip.departsAt }, now)) return;
    if (!(await anyoneBooked(tx, tripId))) return;
    if (!(await preferencesOf(tx, trip.driverId)).reminders) return;
    await add(tx, { kind, to: "driver", recipientId: trip.driverId, tripId }, key, now);
  }

  /**
   * Step 2: scheduled notifications whose moment came, sent if they still
   * apply, else dropped. An unread messages email whose messages were read
   * meanwhile, but not newer ones, waits for those instead.
   */
  function takeSchedules(): Promise<number> {
    return db.transaction(async (tx) => {
      const now = clock();
      const due = await tx
        .select()
        .from(scheduledNotifications)
        .where(and(isNull(scheduledNotifications.doneAt), lte(scheduledNotifications.runAt, now)))
        .orderBy(asc(scheduledNotifications.runAt))
        .limit(batchSize)
        .for("update", { skipLocked: true });
      const done: string[] = [];
      for (const scheduled of due) {
        const booking =
          scheduled.bookingId === null ? undefined : await partiesOf(tx, scheduled.bookingId);
        const source = { key: `schedule:${scheduled.key}` };
        const to = scheduled.recipient;
        if (scheduled.kind === "rate_trip" || scheduled.kind === "rate_trip_driver") {
          await remindToReview(tx, scheduled, source.key, now);
        } else if (booking !== undefined && scheduled.kind === "unread_messages") {
          if (to === "driver" || to === "passenger") {
            const at = await unreadEmailAt(tx, booking, to);
            if (at !== null && at > now) {
              await tx
                .update(scheduledNotifications)
                .set({ runAt: at, updatedAt: now })
                .where(eq(scheduledNotifications.id, scheduled.id));
              continue;
            }
            if (at !== null) await notify(tx, { type: "UnreadMessages", to }, booking, source, now);
          }
        } else if (booking !== undefined) {
          const event = stillDue(scheduled.kind, booking, now);
          const skip =
            event?.type === "ReminderDue" && !(await reminderGoes(tx, event, booking, now));
          if (event !== null && !skip) await notify(tx, event, booking, source, now);
        } else if (scheduled.tripId !== null && isDriverReminder(scheduled.kind)) {
          await remindDriver(tx, scheduled.kind, scheduled.tripId, source.key, now);
        }
        done.push(scheduled.id);
      }
      if (done.length > 0) {
        await tx
          .update(scheduledNotifications)
          .set({ doneAt: now, updatedAt: now })
          .where(inArray(scheduledNotifications.id, done));
      }
      return done.length;
    });
  }

  /** A delivery of a kind the channel switches do not hold (spec 22, R22.5). */
  const switchExempt = db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.id, notificationDeliveries.notificationId),
        inArray(notifications.kind, [...switchExemptKinds]),
      ),
    );

  /** Takes the next delivery that is due on a channel that is not paused, with a lease, or none. */
  async function claim(paused: readonly string[]): Promise<Delivery | undefined> {
    const now = clock();
    const next = db
      .select({ id: notificationDeliveries.id })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.status, "queued"),
          lte(notificationDeliveries.nextAttemptAt, now),
          // A paused channel's messages wait where they are (spec 10, 3.3),
          // except a console recovery's notice.
          paused.length === 0
            ? undefined
            : or(notInArray(notificationDeliveries.channel, [...paused]), exists(switchExempt)),
        ),
      )
      .orderBy(asc(notificationDeliveries.nextAttemptAt))
      .limit(1)
      .for("update", { skipLocked: true });
    const [claimed] = await db
      .update(notificationDeliveries)
      .set({
        status: "sending",
        attempts: sql`${notificationDeliveries.attempts} + 1`,
        nextAttemptAt: new Date(now.getTime() + sendLeaseSeconds * 1000),
        updatedAt: now,
      })
      .where(eq(notificationDeliveries.id, sql`(${next})`))
      .returning();
    return claimed;
  }

  /** Tokens the push service says no longer work. */
  async function forgetTokens(ids: readonly string[]): Promise<void> {
    if (ids.length > 0) await db.delete(pushTokens).where(inArray(pushTokens.id, [...ids]));
  }

  /** After a push went out: its tickets, to ask about later, and the tokens gone. */
  async function afterPush(outcome: PushOutcome, now: Date): Promise<void> {
    await forgetTokens(outcome.gone);
    if (outcome.tickets.length === 0) return;
    // A token that went while the push was on its way has nothing to ask about.
    const still = await db
      .select({ id: pushTokens.id })
      .from(pushTokens)
      .where(inArray(pushTokens.id, [...new Set(outcome.tickets.map((ticket) => ticket.tokenId))]));
    const live = new Set(still.map((token) => token.id));
    const tickets = outcome.tickets.filter((ticket) => live.has(ticket.tokenId));
    if (tickets.length === 0) return;
    await db
      .insert(pushTickets)
      .values(
        tickets.map((ticket) => ({
          id: ticket.id,
          pushTokenId: ticket.tokenId,
          checkAt: new Date(now.getTime() + receiptAfterMs),
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing();
  }

  async function sendOn(delivery: Delivery): Promise<SendResult | undefined> {
    const found = await factsOf(db, delivery.notificationId, clock(), switchesOff);
    if (found === undefined) return undefined;
    // Looked at again on every try: a retry after the booking moved on, after
    // the messages were read, after everyone's booking ended, or after
    // reminders were turned off, is dropped.
    if ("current" in found) {
      if (!found.current) return { skipped: "no_longer_applies" };
    } else if ("passengers" in found.facts) {
      if (found.facts.passengers.length === 0) return { skipped: "no_longer_applies" };
    } else if (
      found.booking !== null &&
      !stillApplies(found.facts.kind, statusAt(found.booking, clock()))
    ) {
      return { skipped: "no_longer_applies" };
    }
    const reminder = reminderOf(found.facts);
    if (
      reminder !== null &&
      (!reminderStillTimely(reminder, clock()) ||
        !(await preferencesOf(db, found.recipientId)).reminders)
    ) {
      return { skipped: "no_longer_applies" };
    }
    // "How was your trip?" follows the trip reminders switch (spec 8, 3.7.6).
    if (
      (found.facts.kind === "rate_trip" || found.facts.kind === "rate_trip_driver") &&
      !(await preferencesOf(db, found.recipientId)).reminders
    ) {
      return { skipped: "no_longer_applies" };
    }
    if (
      found.facts.kind === "unread_messages" &&
      !(await anyUnread(db, found.facts.bookingId, found.recipientId))
    ) {
      return { skipped: "no_longer_applies" };
    }
    // A message whose sender was erased since says nothing (A47).
    if (found.facts.kind === "new_message" && found.facts.message === null) {
      return { skipped: "no_longer_applies" };
    }
    if ("messageRemoved" in found && found.messageRemoved) return { skipped: "no_longer_applies" };
    // A point back in use since it was paused, or a booking that no longer
    // stops there (spec 2, 3.6.4).
    if (found.facts.kind === "meeting_point_changed" && found.facts.pausedPoint === null) {
      return { skipped: "no_longer_applies" };
    }
    // A moved point's news, once the booking no longer stops there or the
    // trip has passed it (3.6.6).
    if (found.facts.kind === "meeting_point_moved" && found.facts.movedPoint === null) {
      return { skipped: "no_longer_applies" };
    }
    const text = () => notificationText(found.facts, found.locale, settings);
    switch (delivery.channel) {
      case "push": {
        // Looked up again: a session may have ended since.
        const tokens = await tokensOf(db, found.recipientId);
        if (tokens.length === 0) return { skipped: "no_device" };
        const { title, body, path } = text();
        const tickets = await push.send(
          tokens.map(({ token }) => ({ to: token, title, body, data: { path } })),
        );
        const outcome: PushOutcome = {
          tickets: tokens.flatMap(({ id: tokenId }, index) => {
            const ticket = tickets[index];
            return ticket?.status === "ok" && ticket.id !== "" ? [{ id: ticket.id, tokenId }] : [];
          }),
          gone: tokens.flatMap(({ id: tokenId }, index) => {
            const ticket = tickets[index];
            return ticket?.status === "error" && ticket.code === deviceNotRegistered
              ? [tokenId]
              : [];
          }),
        };
        if (!tickets.some((ticket) => ticket.status === "ok")) {
          // Nothing went out, so the next try goes to the tokens still there.
          await forgetTokens(outcome.gone);
          throw new Error("The push service refused every message.");
        }
        return {
          ref: outcome.tickets.map((ticket) => ticket.id).join(" "),
          push: outcome,
        };
      }
      case "email": {
        if (email === undefined) return { skipped: "email_off" };
        if (found.email === null) return { skipped: "no_email" };
        const content = emailContent(text(), found.locale, email.webAppUrl);
        const sent = await email.sender.send({
          to: found.email,
          ...content,
          idempotencyKey: delivery.id,
        });
        return { ref: sent.id };
      }
      case "sms": {
        if (sms === undefined) return { skipped: "sms_off" };
        // Booking news, and an operator's alert of a safety report.
        if (!("phone" in found) || isAccountNotice(found.facts.kind)) {
          throw new Error("An SMS is about a booking or a safety report.");
        }
        if (found.phone === null) return { skipped: "no_phone" };
        // Never at night, even when a send from before 23:00 is tried again
        // (R9.9); a recovery notice follows the operator's own action (R22.4).
        if (
          isOperatorFacts(found.facts) &&
          found.facts.kind !== "console_recovered" &&
          !alertChannels(true, clock(), defaultSafetySettings).includes("sms")
        ) {
          return { skipped: "outside_sms_window" };
        }
        try {
          await sms.send({ to: found.phone, text: smsText(found.facts, found.locale) });
        } catch (error) {
          // A message the provider may have taken is never sent again (R7.6).
          if (error instanceof SmsMaybeSent) {
            throw new MaybeSent("The SMS provider may have sent it.", { cause: error });
          }
          throw error;
        }
        return { ref: "" };
      }
      default:
        throw new Error(`No such channel: ${delivery.channel}.`);
    }
  }

  /**
   * Sends one claimed delivery and stores what came of it, only while this
   * worker still holds it: once the lease has run out, the sweep's
   * `interrupted` stands. A send that went through is stored even then, as
   * that is what happened. If storing it fails, the delivery stays `sending`
   * and the sweep marks it interrupted: it is never sent again (R7.6).
   */
  async function deliver(delivery: Delivery): Promise<"sent" | "failed" | "skipped"> {
    const claimed = and(
      eq(notificationDeliveries.id, delivery.id),
      eq(notificationDeliveries.attempts, delivery.attempts),
    );
    const holding = and(claimed, eq(notificationDeliveries.status, "sending"));
    const store = (changes: Partial<Delivery>, where = holding) =>
      db
        .update(notificationDeliveries)
        .set({ ...changes, updatedAt: clock() })
        .where(where);
    let result: SendResult | undefined;
    try {
      result = await sendOn(delivery);
    } catch (error) {
      onSendError?.(error, { id: delivery.id, channel: delivery.channel });
      if (error instanceof MaybeSent) {
        // It may have reached the phones or the inbox: never sent again (R7.6).
        await store({ status: "failed", reason: "interrupted", nextAttemptAt: null });
        return "failed";
      }
      const again = retryAt(
        { queuedAt: delivery.createdAt, attempts: delivery.attempts },
        clock(),
        settings,
      );
      await store({
        status: again === null ? "failed" : "queued",
        reason: "send_failed",
        nextAttemptAt: again,
      });
      return "failed";
    }
    // Deleted with its notification in the meantime.
    if (result === undefined) return "skipped";
    if ("skipped" in result) {
      await store({ status: "skipped", reason: result.skipped, nextAttemptAt: null });
      return "skipped";
    }
    await store(
      {
        status: "sent",
        providerRef: result.ref,
        reason: null,
        sentAt: clock(),
        nextAttemptAt: null,
      },
      and(
        claimed,
        or(
          eq(notificationDeliveries.status, "sending"),
          and(
            eq(notificationDeliveries.status, "failed"),
            eq(notificationDeliveries.reason, "interrupted"),
          ),
        ),
      ),
    );
    // Book-keeping only, once the send is stored: a failure here is reported,
    // never taken for a failed send.
    if (result.push !== undefined) await afterPush(result.push, clock());
    return "sent";
  }

  /** Step 3: deliveries that are due, one at a time. */
  async function sendDue(): Promise<{ sent: number; failed: number }> {
    const now = clock();
    // A send cut off, as by a restart, may have reached the person: it is
    // never tried again, so nobody gets the same thing twice (R7.6).
    await db
      .update(notificationDeliveries)
      .set({ status: "failed", reason: "interrupted", nextAttemptAt: null, updatedAt: now })
      .where(
        and(
          eq(notificationDeliveries.status, "sending"),
          lte(notificationDeliveries.nextAttemptAt, now),
        ),
      );
    const switches = await switchesNow();
    const paused = channels.flatMap(([channel, key]) =>
      switches[key]?.on === false ? [channel] : [],
    );
    // A channel back on sends what waited, but not old news: a message
    // queued before it came back, longer ago than a failed send is tried
    // again for, is skipped (spec 10, 3.3).
    const tooOld = new Date(now.getTime() - settings.retryForMinutes * 60_000);
    for (const [channel, key] of channels) {
      const state = switches[key];
      if (state?.on !== true || state.since === null) continue;
      await db
        .update(notificationDeliveries)
        .set({ status: "skipped", reason: "paused_too_long", nextAttemptAt: null, updatedAt: now })
        .where(
          and(
            eq(notificationDeliveries.status, "queued"),
            eq(notificationDeliveries.channel, channel),
            lte(notificationDeliveries.createdAt, state.since),
            lte(notificationDeliveries.createdAt, tooOld),
            notExists(switchExempt),
          ),
        );
    }
    let sent = 0;
    let failed = 0;
    for (let count = 0; count < batchSize; count++) {
      const delivery = await claim(paused);
      if (delivery === undefined) break;
      const outcome = await deliver(delivery);
      if (outcome === "sent") sent += 1;
      if (outcome === "failed") failed += 1;
    }
    return { sent, failed };
  }

  /**
   * A switch for emergencies left off (spec 10, 3.3): every operator is
   * told after an hour, and once a day after that, with all that is off at
   * the time. Counted from the switch that has been off longest, so two
   * switches turned off together give one reminder.
   */
  async function remindOfSwitches(): Promise<void> {
    const switches = await switchesNow();
    const offSince = switchKeys.flatMap((key) => {
      const state = switches[key];
      return state?.on === false && state.since !== null ? [state.since.getTime()] : [];
    });
    if (offSince.length === 0) return;
    const now = clock();
    const longest = new Date(Math.min(...offSince));
    const reminder = switchReminderNumber(longest, now);
    if (reminder === null) return;
    const key = `switch_still_off:${longest.toISOString()}:${String(reminder)}`;
    await db.transaction(async (tx) => {
      const operators = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.status, "active"), sql`${users.roles} @> array[${operatorRole}]::text[]`),
        );
      for (const operator of operators) {
        await add(tx, { kind: "switch_still_off", to: null, recipientId: operator.id }, key, now);
      }
    });
  }

  /**
   * Step 4: asks about pushes sent 15 minutes ago or more. A token the
   * phone's push service no longer knows is removed; a receipt not ready
   * yet is asked for again, until the push service no longer keeps it
   * (a day), whether or not it can be asked.
   */
  async function checkReceipts(): Promise<number> {
    const now = clock();
    const later = new Date(now.getTime() + receiptAfterMs);
    await db
      .delete(pushTickets)
      .where(lte(pushTickets.createdAt, new Date(now.getTime() - receiptsKeptMs)));
    const due = await db
      .select()
      .from(pushTickets)
      .where(lte(pushTickets.checkAt, now))
      .orderBy(asc(pushTickets.checkAt))
      .limit(receiptsPerRun);
    if (due.length === 0) return 0;
    const ids = due.map((ticket) => ticket.id);
    let receipts: ReadonlyMap<string, PushReceipt>;
    try {
      receipts = await push.receipts(ids);
    } catch (error) {
      // Asked again in 15 minutes, not on every run while Expo is down.
      await db
        .update(pushTickets)
        .set({ checkAt: later, updatedAt: now })
        .where(inArray(pushTickets.id, ids));
      throw error;
    }
    await forgetTokens(
      due.flatMap((ticket) => {
        const receipt = receipts.get(ticket.id);
        return receipt?.status === "error" && receipt.code === deviceNotRegistered
          ? [ticket.pushTokenId]
          : [];
      }),
    );
    const done = ids.filter((id) => receipts.has(id));
    if (done.length > 0) await db.delete(pushTickets).where(inArray(pushTickets.id, done));
    const waiting = ids.filter((id) => !receipts.has(id));
    if (waiting.length > 0) {
      await db
        .update(pushTickets)
        .set({ checkAt: later, updatedAt: now })
        .where(inArray(pushTickets.id, waiting));
    }
    return receipts.size;
  }

  return {
    async runOnce() {
      // Each step runs even when one before it failed; the first failure is
      // thrown once all have run, for the job to log and report.
      const failures: unknown[] = [];
      const step = async <T>(run: () => Promise<T>, none: T): Promise<T> => {
        try {
          return await run();
        } catch (error) {
          failures.push(error);
          return none;
        }
      };
      const events = await step(takeEvents, 0);
      const scheduled = await step(takeSchedules, 0);
      await step(remindOfSwitches, undefined);
      const { sent, failed } = await step(sendDue, { sent: 0, failed: 0 });
      const receipts = await step(checkReceipts, 0);
      if (failures.length > 0) throw failures[0];
      return { events, scheduled, sent, failed, receipts };
    },
  };
}
