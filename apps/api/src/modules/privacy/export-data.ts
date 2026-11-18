import { schema } from "@shareride/db";
import { reporterOf, type DisputeKind, type ExportSection, type TripRole } from "@shareride/domain";
import {
  createTranslator,
  quickMessageText,
  systemLineText,
  type Locale,
  type ShownSystemLine,
} from "@shareride/i18n";
import { and, asc, eq, gte, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Queryable } from "../bookings/seats.ts";
import { quickOf, systemLineOf } from "../chat/service.ts";

// What "Download my data" holds (spec 11, 3.2.3): the person's own data,
// and other people by first name only, never their IDs, numbers or emails
// (R11.2). Each section is fed by the tables the personal data catalogue
// (packages/db/src/personal-data.ts) names for it.

const {
  blocks,
  moderationActions,
  operatorNotes,
  bookingSegmentPrices,
  bookings,
  checkIns,
  conversations,
  disputes,
  emailVerifications,
  legalAcceptances,
  legalDocuments,
  meetingPointIssues,
  meetingPoints,
  messages,
  notificationDeliveries,
  notificationPreferences,
  notifications,
  payments,
  feedback,
  feedbackScreenshots,
  privacyRequests,
  pushTokens,
  reports,
  reviews,
  segments,
  sessions,
  tripChanges,
  trips,
  tripStops,
  users,
  vehicles,
} = schema;

const drivers = alias(users, "drivers");
const passengers = alias(users, "passengers");
const fromStops = alias(tripStops, "from_stops");
const toStops = alias(tripStops, "to_stops");
const fromPoints = alias(meetingPoints, "from_points");
const toPoints = alias(meetingPoints, "to_points");
const blockedPeople = alias(users, "blocked_people");
const reportedPeople = alias(users, "reported_people");

/** A moment as text, or null. */
type When = string | null;
const when = (moment: Date | null): When => (moment === null ? null : moment.toISOString());

/**
 * Whether a cancellation counts on reliability, and when ShareRide made it
 * count: part of the record of whoever cancelled (spec 8, 6), so a booking
 * the driver cancelled has it in the driver's export, not the passenger's.
 * The operator's reason for it is theirs only, as a report's decision note is.
 */
const countingOf = (row: {
  readonly countsOnReliability: boolean;
  readonly overruledAt: Date | null;
}) => ({
  countsOnReliability: row.countsOnReliability,
  overruledAt: when(row.overruledAt),
});

/** The notification log in an export goes back this far (spec 11, 3.2.3). */
const notificationDays = 90;

export interface ExportData {
  readonly format: "shareride-export";
  readonly version: 1;
  readonly createdAt: string;
  readonly locale: Locale;
  readonly sections: { readonly [Section in ExportSection]: unknown };
}

/** Where a feedback's screenshot is in the export's ZIP. */
export const screenshotFileName = (feedbackId: string) => `feedback/${feedbackId}.jpg`;

/**
 * The files an export holds besides its data: the screenshots the person
 * sent with feedback (spec 12, section 7). Read in the snapshot that
 * `collectExport` reads, so each file the data names is there.
 */
export async function collectExportFiles(
  q: Queryable,
  userId: string,
): Promise<readonly { readonly name: string; readonly data: Buffer }[]> {
  const rows = await q
    .select({ id: feedback.id, file: feedbackScreenshots.file })
    .from(feedbackScreenshots)
    .innerJoin(feedback, eq(feedback.id, feedbackScreenshots.feedbackId))
    .where(eq(feedback.userId, userId))
    .orderBy(asc(feedback.createdAt), asc(feedback.id));
  return rows.map((row) => ({ name: screenshotFileName(row.id), data: row.file }));
}

interface Named {
  readonly nameIs: string;
  readonly nameEn: string | null;
}

/** A place's name in the person's language; a place without an English name keeps its own. */
function placeName(locale: Locale, point: Named): string {
  return locale === "en" ? (point.nameEn ?? point.nameIs) : point.nameIs;
}

export async function collectExport(q: Queryable, userId: string, now: Date): Promise<ExportData> {
  const [user] = await q.select().from(users).where(eq(users.id, userId));
  if (user === undefined) throw new Error("The person to export does not exist.");
  const locale: Locale = user.locale === "is" ? "is" : "en";
  const name = (point: Named) => placeName(locale, point);

  const account = {
    phoneNumber: user.phoneE164,
    phoneVerifiedAt: when(user.phoneVerifiedAt),
    firstName: user.firstName,
    about: user.about,
    aboutHiddenAt: when(user.aboutHiddenAt),
    languages: user.languages,
    locale: user.locale,
    email: user.emailVerifiedAt === null ? null : user.email,
    emailVerifiedAt: when(user.emailVerifiedAt),
    ageConfirmedAt: when(user.ageConfirmedAt),
    licenceDeclaredAt: when(user.licenceDeclaredAt),
    roles: user.roles,
    status: user.status,
    suspendedUntil: when(user.suspendedUntil),
    deleteAfter: when(user.deleteAfter),
    memberSince: when(user.createdAt),
  };

  const legal = await q
    .select({
      document: legalDocuments.type,
      version: legalAcceptances.version,
      locale: legalAcceptances.locale,
      acceptedAt: legalAcceptances.acceptedAt,
    })
    .from(legalAcceptances)
    .innerJoin(legalDocuments, eq(legalDocuments.id, legalAcceptances.documentId))
    .where(eq(legalAcceptances.userId, userId))
    .orderBy(asc(legalAcceptances.acceptedAt));

  const [preferences] = await q
    .select({
      reminders: notificationPreferences.reminders,
      betaNews: notificationPreferences.betaNews,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));

  const devices = await q
    .select({
      id: sessions.id,
      deviceName: sessions.deviceName,
      platform: sessions.platform,
      appVersion: sessions.appVersion,
      signedInAt: sessions.createdAt,
      lastActiveAt: sessions.lastActiveAt,
      endedAt: sessions.endedAt,
      endReason: sessions.endReason,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(asc(sessions.createdAt));
  const pushed = new Set(
    (
      await q
        .select({ sessionId: pushTokens.sessionId })
        .from(pushTokens)
        .where(eq(pushTokens.userId, userId))
    ).map((row) => row.sessionId),
  );

  const waiting = await q
    .select({ email: emailVerifications.email, sentAt: emailVerifications.sentAt })
    .from(emailVerifications)
    .where(
      and(
        eq(emailVerifications.userId, userId),
        isNull(emailVerifications.usedAt),
        isNull(emailVerifications.failedAt),
      ),
    );

  const cars = await q
    .select()
    .from(vehicles)
    .where(eq(vehicles.ownerId, userId))
    .orderBy(asc(vehicles.createdAt));
  const carOf = new Map(cars.map((car) => [car.id, car]));

  // The person's own "I'm here" times (spec 8, 3.2): a passenger's with
  // their booking, a driver's at a stop of their trip. The other side's stay
  // with the other side.
  const ownCheckIns = await q
    .select({
      stopId: checkIns.tripStopId,
      bookingId: checkIns.bookingId,
      at: checkIns.checkedInAt,
    })
    .from(checkIns)
    .where(eq(checkIns.userId, userId));
  const checkedInAt = (match: (checkIn: (typeof ownCheckIns)[number]) => boolean) =>
    when(ownCheckIns.find(match)?.at ?? null);

  // Reports about a ride they raised or answered (spec 8, 3.3 and 3.4), each
  // with the person's own note only: the other side's note and the
  // operator's are for the operator (spec 8, 7), so they are not read here.
  const rideReports = await q
    .select({
      bookingId: disputes.bookingId,
      kind: disputes.kind,
      raisedAt: disputes.raisedAt,
      note: disputes.note,
      answer: disputes.answer,
      answeredAt: disputes.answeredAt,
      answerNote: disputes.answerNote,
      outcome: disputes.outcome,
      decidedBy: disputes.decidedBy,
      decidedAt: disputes.decidedAt,
    })
    .from(disputes)
    .innerJoin(bookings, eq(bookings.id, disputes.bookingId))
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .where(or(eq(bookings.passengerId, userId), eq(trips.driverId, userId)));
  const reportOn = (bookingId: string, role: TripRole) => {
    const report = rideReports.find((row) => row.bookingId === bookingId);
    if (report === undefined) return null;
    const reportedBy = reporterOf(report.kind as DisputeKind);
    return {
      kind: report.kind,
      reportedBy,
      reportedAt: when(report.raisedAt),
      yourNote: reportedBy === role ? report.note : report.answerNote,
      answer: report.answer,
      answeredAt: when(report.answeredAt),
      outcome: report.outcome,
      decidedBy: report.decidedBy,
      closedAt: when(report.decidedAt),
    };
  };

  // Reviews (spec 8, 3.7): each the person wrote, and each about them once
  // it shows (R8.9), so the file never shows one before the app does. One
  // the operator hid is there, marked hidden.
  const reviewed = await q
    .select({
      bookingId: reviews.bookingId,
      authorId: reviews.authorId,
      rating: reviews.rating,
      comment: reviews.comment,
      sentAt: reviews.createdAt,
      shownAt: reviews.revealedAt,
      hiddenAt: reviews.hiddenAt,
    })
    .from(reviews)
    .where(
      or(
        eq(reviews.authorId, userId),
        and(eq(reviews.subjectId, userId), isNotNull(reviews.revealedAt)),
      ),
    );
  const reviewsOn = (bookingId: string) => {
    const shown = (mine: boolean) => {
      const found = reviewed.find(
        (row) => row.bookingId === bookingId && (row.authorId === userId) === mine,
      );
      return found === undefined
        ? null
        : {
            rating: found.rating,
            comment: found.comment,
            sentAt: when(found.sentAt),
            shownAt: when(found.shownAt),
            hiddenAt: when(found.hiddenAt),
          };
    };
    return { yourReview: shown(true), theirReview: shown(false) };
  };
  // Those about the person from trips made anonymous: by nobody and on no
  // ride, so only how the author travelled (A51).
  const earlierReviews = await q
    .select({
      authorRole: reviews.authorRole,
      rating: reviews.rating,
      comment: reviews.comment,
      sentAt: reviews.createdAt,
      shownAt: reviews.revealedAt,
      hiddenAt: reviews.hiddenAt,
    })
    .from(reviews)
    .where(
      and(eq(reviews.subjectId, userId), isNull(reviews.bookingId), isNotNull(reviews.revealedAt)),
    )
    .orderBy(asc(reviews.createdAt), asc(reviews.id));

  // Trips the person posted, with what passengers booked on them.
  const posted = await q
    .select()
    .from(trips)
    .where(eq(trips.driverId, userId))
    .orderBy(asc(trips.createdAt));
  const postedIds = posted.map((trip) => trip.id);
  const stops =
    postedIds.length === 0
      ? []
      : await q
          .select({ stop: tripStops, point: meetingPoints })
          .from(tripStops)
          .innerJoin(meetingPoints, eq(meetingPoints.id, tripStops.meetingPointId))
          .where(inArray(tripStops.tripId, postedIds))
          .orderBy(asc(tripStops.position));
  const legs =
    postedIds.length === 0
      ? []
      : await q
          .select()
          .from(segments)
          .where(inArray(segments.tripId, postedIds))
          .orderBy(asc(segments.position));
  const changes =
    postedIds.length === 0
      ? []
      : await q
          .select()
          .from(tripChanges)
          .where(inArray(tripChanges.tripId, postedIds))
          .orderBy(asc(tripChanges.changedAt));
  const riders =
    postedIds.length === 0
      ? []
      : await q
          .select({
            booking: bookings,
            firstName: passengers.firstName,
            from: fromPoints,
            to: toPoints,
          })
          .from(bookings)
          .innerJoin(passengers, eq(passengers.id, bookings.passengerId))
          .innerJoin(fromStops, eq(fromStops.id, bookings.fromStopId))
          .innerJoin(toStops, eq(toStops.id, bookings.toStopId))
          .innerJoin(fromPoints, eq(fromPoints.id, fromStops.meetingPointId))
          .innerJoin(toPoints, eq(toPoints.id, toStops.meetingPointId))
          .where(inArray(bookings.tripId, postedIds))
          .orderBy(asc(bookings.createdAt));
  const stopName = new Map(stops.map(({ stop, point }) => [stop.id, name(point)]));

  const tripsPosted = posted.map((trip) => {
    const car = trip.vehicleId === null ? undefined : carOf.get(trip.vehicleId);
    return {
      id: trip.id,
      status: trip.status,
      createdAt: when(trip.createdAt),
      publishedAt: when(trip.publishedAt),
      departsAt: when(trip.departsAt),
      arrivesAt: when(trip.arrivesAt),
      seats: trip.capacity,
      priceLevel: trip.priceLevel,
      bookingMode: trip.bookingMode,
      luggage: trip.luggage,
      pets: trip.pets,
      smoking: trip.smoking,
      childSeat: trip.childSeat,
      chat: trip.chat,
      note: trip.note,
      noteHiddenAt: when(trip.noteHiddenAt),
      car:
        car === undefined
          ? null
          : {
              make: car.make,
              model: car.model,
              colour: car.colour,
              registration: car.registration,
            },
      stops: stops
        .filter(({ stop }) => stop.tripId === trip.id)
        .map(({ stop, point }) => ({
          place: name(point),
          plannedAt: when(stop.plannedAt),
          removedAt: when(stop.removedAt),
          checkedInAt: checkedInAt(
            (checkIn) => checkIn.bookingId === null && checkIn.stopId === stop.id,
          ),
        })),
      prices: legs
        .filter((leg) => leg.tripId === trip.id)
        .map((leg) => ({
          from: stopName.get(leg.fromStopId) ?? null,
          to: stopName.get(leg.toStopId) ?? null,
          price: leg.price,
          currency: leg.currency,
        })),
      changes: changes
        .filter((change) => change.tripId === trip.id)
        .map((change) => ({
          kind: change.kind,
          before: change.before,
          after: change.after,
          changedAt: when(change.changedAt),
        })),
      cancelledAt: when(trip.cancelledAt),
      cancelledBy: trip.cancelledBy,
      cancelReason: trip.cancelReason,
      cancelNote: trip.cancelNote,
      ...countingOf(trip),
      passengers: riders
        .filter((row) => row.booking.tripId === trip.id)
        .map(({ booking, firstName, from, to }) => ({
          firstName,
          from: name(from),
          to: name(to),
          seats: booking.seats,
          total: booking.totalPrice,
          currency: booking.currency,
          status: booking.status,
          message: booking.message,
          declineReason: booking.declineReason,
          cancelledBy: booking.cancelledBy,
          cancelReason: booking.cancelReason,
          cancelNote: booking.cancelNote,
          ...(booking.cancelledBy === "driver" ? countingOf(booking) : {}),
          dispute: reportOn(booking.id, "driver"),
          ...reviewsOn(booking.id),
        })),
    };
  });

  // The person's own bookings and requests as a passenger.
  const booked = await q
    .select({
      booking: bookings,
      driverName: drivers.firstName,
      from: fromPoints,
      to: toPoints,
      boardsAt: fromStops.plannedAt,
      alightsAt: toStops.plannedAt,
    })
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .innerJoin(drivers, eq(drivers.id, trips.driverId))
    .innerJoin(fromStops, eq(fromStops.id, bookings.fromStopId))
    .innerJoin(toStops, eq(toStops.id, bookings.toStopId))
    .innerJoin(fromPoints, eq(fromPoints.id, fromStops.meetingPointId))
    .innerJoin(toPoints, eq(toPoints.id, toStops.meetingPointId))
    .where(eq(bookings.passengerId, userId))
    .orderBy(asc(bookings.createdAt));
  // What each booking paid per stretch, as it was booked (spec 6, 3.2).
  const stretches =
    booked.length === 0
      ? []
      : await q
          .select({
            bookingId: bookingSegmentPrices.bookingId,
            price: bookingSegmentPrices.price,
            from: fromPoints,
            to: toPoints,
          })
          .from(bookingSegmentPrices)
          .innerJoin(bookings, eq(bookings.id, bookingSegmentPrices.bookingId))
          .innerJoin(
            segments,
            and(
              eq(segments.tripId, bookings.tripId),
              eq(segments.position, bookingSegmentPrices.segmentPosition),
            ),
          )
          .innerJoin(fromStops, eq(fromStops.id, segments.fromStopId))
          .innerJoin(toStops, eq(toStops.id, segments.toStopId))
          .innerJoin(fromPoints, eq(fromPoints.id, fromStops.meetingPointId))
          .innerJoin(toPoints, eq(toPoints.id, toStops.meetingPointId))
          .where(eq(bookings.passengerId, userId))
          .orderBy(asc(bookingSegmentPrices.segmentPosition));
  const bookingsSection = booked.map(({ booking, driverName, from, to, boardsAt, alightsAt }) => ({
    id: booking.id,
    tripId: booking.tripId,
    driver: { firstName: driverName },
    from: { place: name(from), plannedAt: when(boardsAt) },
    to: { place: name(to), plannedAt: when(alightsAt) },
    seats: booking.seats,
    total: booking.totalPrice,
    currency: booking.currency,
    status: booking.status,
    message: booking.message,
    prices: stretches
      .filter((stretch) => stretch.bookingId === booking.id)
      .map((stretch) => ({
        from: name(stretch.from),
        to: name(stretch.to),
        price: stretch.price,
        currency: booking.currency,
      })),
    requestedAt: when(booking.requestedAt),
    requestExpiresAt: when(booking.expiresAt),
    decidedAt: when(booking.decidedAt),
    paymentDueAt: when(booking.paymentDueAt),
    confirmedAt: when(booking.confirmedAt),
    checkedInAt: checkedInAt((checkIn) => checkIn.bookingId === booking.id),
    dispute: reportOn(booking.id, "passenger"),
    ...reviewsOn(booking.id),
    expiredAt: when(booking.expiredAt),
    cancelledAt: when(booking.cancelledAt),
    cancelledBy: booking.cancelledBy,
    cancelReason: booking.cancelReason,
    cancelNote: booking.cancelNote,
    refund: booking.refundAmount,
    ...(booking.cancelledBy === "driver" ? {} : countingOf(booking)),
  }));

  const paid = await q
    .select({ payment: payments })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .where(eq(bookings.passengerId, userId))
    .orderBy(asc(payments.createdAt));
  const paymentsSection = paid.map(({ payment }) => ({
    bookingId: payment.bookingId,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    provider: payment.provider,
    providerReference: payment.providerRef,
    startedAt: when(payment.createdAt),
    settledAt: when(payment.settledAt),
  }));

  // Conversations they took part in: as the passenger, or as the driver.
  const talks = await q
    .select({
      conversationId: conversations.id,
      bookingId: bookings.id,
      passengerId: bookings.passengerId,
      driverName: drivers.firstName,
      passengerName: passengers.firstName,
    })
    .from(conversations)
    .innerJoin(bookings, eq(bookings.id, conversations.bookingId))
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .innerJoin(drivers, eq(drivers.id, trips.driverId))
    .innerJoin(passengers, eq(passengers.id, bookings.passengerId))
    .where(or(eq(bookings.passengerId, userId), eq(trips.driverId, userId)))
    .orderBy(asc(conversations.openedAt));
  const lines =
    talks.length === 0
      ? []
      : await q
          .select()
          .from(messages)
          .where(
            inArray(
              messages.conversationId,
              talks.map((talk) => talk.conversationId),
            ),
          )
          .orderBy(asc(messages.sentAt), asc(messages.id));
  const t = createTranslator(locale);
  /** What a message says in the person's language: quick messages and ShareRide's lines too. */
  const said = (line: (typeof lines)[number], viewer: TripRole, other: string) => {
    if (line.erasedAt !== null) return t("chat.messageDeleted");
    if (line.kind === "quick") return quickMessageText(t, quickOf(line));
    if (line.kind !== "system") return line.body;
    const shown = systemLineOf(line, viewer);
    const seen: ShownSystemLine =
      shown.key === "stop_added" || shown.key === "stop_removed"
        ? { ...shown, stop: name({ nameIs: shown.stop.is, nameEn: shown.stop.en }) }
        : shown;
    return systemLineText(t, seen, other);
  };
  const conversationsSection = talks.map((talk) => {
    const viewer: TripRole = talk.passengerId === userId ? "passenger" : "driver";
    const other =
      (viewer === "passenger" ? talk.driverName : talk.passengerName) ?? t("people.formerMember");
    return {
      bookingId: talk.bookingId,
      with: { firstName: other },
      messages: lines
        .filter((line) => line.conversationId === talk.conversationId)
        .map((line) => {
          // The other person's message ShareRide removed stays removed here
          // too; one's own words are one's own data (spec 9, 3.4.3).
          const removed = line.hiddenAt !== null && line.senderId !== userId;
          // Never what an erased person said, even where a report kept it.
          const asStored = !removed && line.erasedAt === null;
          return {
            from: line.senderId === null ? "ShareRide" : line.senderId === userId ? "you" : other,
            kind: line.kind,
            text: removed ? t("chat.removed") : said(line, viewer, other),
            // As stored, for other apps: what the text above was made from.
            key: asStored ? line.key : null,
            params: asStored ? line.params : null,
            sentAt: when(line.sentAt),
            readAt: when(line.readAt),
            removedByShareRide: line.hiddenAt !== null,
          };
        }),
    };
  });

  // The reports the person filed, never reports about them (spec 9, R9.2).
  const filed = await q
    .select({
      subject: reports.subject,
      person: reportedPeople.firstName,
      category: reports.category,
      description: reports.description,
      sentAt: reports.createdAt,
      status: reports.status,
      outcome: reports.outcome,
      closedAt: reports.closedAt,
    })
    .from(reports)
    .leftJoin(reportedPeople, eq(reportedPeople.id, reports.subjectUserId))
    .where(eq(reports.reporterId, userId))
    .orderBy(asc(reports.createdAt), asc(reports.id));

  // Problems the person reported with meeting points: only the open ones
  // are still linked to them (spec 2, section 7).
  const pointProblems = await q
    .select({
      nameIs: meetingPoints.nameIs,
      nameEn: meetingPoints.nameEn,
      problem: meetingPointIssues.reason,
      note: meetingPointIssues.note,
      sentAt: meetingPointIssues.createdAt,
    })
    .from(meetingPointIssues)
    .innerJoin(meetingPoints, eq(meetingPoints.id, meetingPointIssues.meetingPointId))
    .where(eq(meetingPointIssues.reporterId, userId))
    .orderBy(asc(meetingPointIssues.createdAt), asc(meetingPointIssues.id));

  // The blocks the person made, never who blocked them (spec 9, 3.2).
  const blocked = await q
    .select({ firstName: blockedPeople.firstName, since: blocks.createdAt })
    .from(blocks)
    .innerJoin(blockedPeople, eq(blockedPeople.id, blocks.blockedId))
    .where(eq(blocks.blockerId, userId))
    .orderBy(asc(blocks.createdAt), asc(blocks.id));

  // What operators wrote down about the person, never who wrote it (spec 9,
  // 3.5.3; A49).
  const noted = await q
    .select({ text: operatorNotes.text, addedAt: operatorNotes.createdAt })
    .from(operatorNotes)
    .where(eq(operatorNotes.userId, userId))
    .orderBy(asc(operatorNotes.createdAt), asc(operatorNotes.id));

  // What ShareRide did about the person and why, with their appeals (spec 9,
  // R9.5); never which operator, nor the report it came from.
  const noticed = await q
    .select({
      kind: moderationActions.kind,
      rule: moderationActions.rule,
      reason: moderationActions.reason,
      content: moderationActions.contentKind,
      until: moderationActions.until,
      createdAt: moderationActions.createdAt,
      appeal: moderationActions.appealText,
      appealedAt: moderationActions.appealedAt,
      appealAnswer: moderationActions.appealAnswer,
      appealOutcome: moderationActions.appealOutcome,
      answeredAt: moderationActions.appealAnsweredAt,
    })
    .from(moderationActions)
    .where(eq(moderationActions.userId, userId))
    .orderBy(asc(moderationActions.createdAt), asc(moderationActions.id));

  const since = new Date(now.getTime() - notificationDays * 24 * 3600 * 1000);
  const told = await q
    .select({
      kind: notifications.kind,
      createdAt: notifications.createdAt,
      channel: notificationDeliveries.channel,
      status: notificationDeliveries.status,
      sentAt: notificationDeliveries.sentAt,
    })
    .from(notifications)
    .innerJoin(notificationDeliveries, eq(notificationDeliveries.notificationId, notifications.id))
    .where(and(eq(notifications.recipientId, userId), gte(notifications.createdAt, since)))
    .orderBy(asc(notifications.createdAt));

  const asked = await q
    .select({
      kind: privacyRequests.kind,
      text: privacyRequests.text,
      receivedAt: privacyRequests.receivedAt,
      dueAt: privacyRequests.dueAt,
      answeredAt: privacyRequests.answeredAt,
      answer: privacyRequests.answer,
    })
    .from(privacyRequests)
    .where(eq(privacyRequests.userId, userId))
    .orderBy(asc(privacyRequests.receivedAt), asc(privacyRequests.id));

  const sent = await q
    .select({
      id: feedback.id,
      kind: feedback.kind,
      message: feedback.message,
      appVersion: feedback.appVersion,
      platform: feedback.platform,
      osVersion: feedback.osVersion,
      screen: feedback.screen,
      locale: feedback.language,
      sentAt: feedback.createdAt,
      reply: feedback.reply,
      repliedAt: feedback.repliedAt,
      picture: feedbackScreenshots.feedbackId,
    })
    .from(feedback)
    .leftJoin(feedbackScreenshots, eq(feedbackScreenshots.feedbackId, feedback.id))
    .where(eq(feedback.userId, userId))
    .orderBy(asc(feedback.createdAt), asc(feedback.id));

  return {
    format: "shareride-export",
    version: 1,
    createdAt: now.toISOString(),
    locale,
    sections: {
      account,
      legal_acceptances: legal.map((row) => ({ ...row, acceptedAt: when(row.acceptedAt) })),
      settings: {
        tripReminders: preferences?.reminders ?? true,
        betaNews: preferences?.betaNews ?? true,
      },
      devices: devices.map(({ id, ...device }) => ({
        ...device,
        signedInAt: when(device.signedInAt),
        lastActiveAt: when(device.lastActiveAt),
        endedAt: when(device.endedAt),
        push: pushed.has(id),
      })),
      email_waiting: waiting.map((row) => ({ email: row.email, sentAt: when(row.sentAt) })),
      vehicles: cars.map((car) => ({
        make: car.make,
        model: car.model,
        colour: car.colour,
        registration: car.registration,
        addedAt: when(car.createdAt),
        removedAt: when(car.removedAt),
      })),
      trips_posted: tripsPosted,
      bookings: bookingsSection,
      earlier_reviews: earlierReviews.map((row) => ({
        ...row,
        sentAt: when(row.sentAt),
        shownAt: when(row.shownAt),
        hiddenAt: when(row.hiddenAt),
      })),
      payments: paymentsSection,
      conversations: conversationsSection,
      reports: filed.map((row) => ({
        ...row,
        sentAt: when(row.sentAt),
        closedAt: when(row.closedAt),
      })),
      meeting_point_reports: pointProblems.map((row) => ({
        place: name(row),
        problem: row.problem,
        note: row.note,
        sentAt: when(row.sentAt),
      })),
      blocks: blocked.map((row) => ({ firstName: row.firstName ?? "", since: when(row.since) })),
      notices: noticed.map((row) => ({
        ...row,
        until: when(row.until),
        createdAt: when(row.createdAt),
        appealedAt: when(row.appealedAt),
        answeredAt: when(row.answeredAt),
      })),
      notes: noted.map((row) => ({ text: row.text, addedAt: when(row.addedAt) })),
      notifications: told.map((row) => ({
        kind: row.kind,
        channel: row.channel,
        status: row.status,
        createdAt: when(row.createdAt),
        sentAt: when(row.sentAt),
      })),
      // `ourAnswer`, as `answer` is a coded field elsewhere in the file.
      privacy_requests: asked.map((row) => ({
        kind: row.kind,
        text: row.text,
        receivedAt: when(row.receivedAt),
        dueAt: when(row.dueAt),
        answeredAt: when(row.answeredAt),
        ourAnswer: row.answer,
      })),
      // The operator's status is theirs, not the person's data. `screenshot`
      // names the picture's file in the ZIP.
      feedback: sent.map(({ id, picture, reply, ...row }) => ({
        ...row,
        sentAt: when(row.sentAt),
        screenshot: picture === null ? null : screenshotFileName(id),
        ourReply: reply,
        repliedAt: when(row.repliedAt),
      })),
    },
  };
}
