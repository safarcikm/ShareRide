import type { MyReport, ReportAbout } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  checkReport,
  type BookingStatus,
  defaultSafetySettings,
  err,
  ok,
  reportLimitReached,
  type ReportCategory,
  type ReportContext,
  type ReportProblem,
  type Result,
  type SafetySettings,
} from "@shareride/domain";
import { and, asc, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { recordEvents } from "../notifications/outbox.ts";
import { authors } from "../people/ratings.ts";
import { shown as everyoneSees } from "../privacy/hidden.ts";
import { closedTrips } from "./blocks.ts";

const { bookings, conversations, formerMemberId, messages, reports, reviews, trips, users } =
  schema;

export type ReportError =
  | { readonly code: "not_found" }
  | { readonly code: "too_many_reports"; readonly retryAfterSeconds: number }
  | Exclude<ReportProblem, { readonly code: "not_involved" }>;

/** Reporting (spec 9, 3.1): the person reported is never told who (R9.2). */
export interface ReportService {
  file(
    me: string,
    report: {
      readonly about: ReportAbout;
      readonly category: ReportCategory;
      readonly description: string;
    },
  ): Promise<Result<MyReport, ReportError>>;
  /** The reports I filed, the latest first (3.1.7). */
  mine(me: string): Promise<MyReport[]>;
}

/** What the report is about, and the records it links (3.1.4). */
interface Found {
  readonly context: ReportContext;
  readonly links: {
    readonly tripId?: string;
    readonly bookingId?: string;
    readonly messageId?: string;
    readonly conversationId?: string;
    readonly reviewId?: string;
  };
}

const dayMs = 24 * 3_600_000;

/** The person a review is about. */
const subjects = alias(users, "subjects");

export function createReportService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings?: SafetySettings;
}): ReportService {
  const { db, clock } = dependencies;
  const settings = dependencies.settings ?? defaultSafetySettings;

  /**
   * What `me` can report, or nothing: a trip I can see, my message or
   * booking, or a person or review a profile shows to anyone.
   */
  async function find(me: string, about: ReportAbout): Promise<Found | undefined> {
    switch (about.kind) {
      case "trip": {
        const [trip] = await db
          .select({ driverId: trips.driverId, status: trips.status })
          .from(trips)
          .where(eq(trips.id, about.tripId));
        if (trip === undefined || trip.status === "draft") return undefined;
        // A trip a block closes to me does not exist for me (R9.4).
        if ((await closedTrips(db, me, [about.tripId])).has(about.tripId)) return undefined;
        return {
          context: { kind: "trip", driverId: trip.driverId },
          links: { tripId: about.tripId },
        };
      }
      case "message": {
        const [message] = await db
          .select({
            senderId: messages.senderId,
            conversationId: messages.conversationId,
            bookingId: conversations.bookingId,
            tripId: bookings.tripId,
            passengerId: bookings.passengerId,
            driverId: trips.driverId,
          })
          .from(messages)
          .innerJoin(conversations, eq(conversations.id, messages.conversationId))
          .innerJoin(bookings, eq(bookings.id, conversations.bookingId))
          .innerJoin(trips, eq(trips.id, bookings.tripId))
          .where(eq(messages.id, about.messageId));
        // Someone else's chat is not there for me, not even a system line in it.
        if (message === undefined || ![message.passengerId, message.driverId].includes(me)) {
          return undefined;
        }
        return {
          context: {
            kind: "message",
            senderId: message.senderId,
            memberIds: [message.passengerId, message.driverId],
          },
          links: {
            tripId: message.tripId,
            bookingId: message.bookingId,
            messageId: about.messageId,
            conversationId: message.conversationId,
          },
        };
      }
      case "booking":
      case "user": {
        const [booking] = await db
          .select({
            tripId: bookings.tripId,
            passengerId: bookings.passengerId,
            status: bookings.status,
            driverId: trips.driverId,
            completedAt: trips.completedAt,
          })
          .from(bookings)
          .innerJoin(trips, eq(trips.id, bookings.tripId))
          .where(eq(bookings.id, about.bookingId));
        if (booking === undefined || ![booking.passengerId, booking.driverId].includes(me)) {
          return undefined;
        }
        const links = { tripId: booking.tripId, bookingId: about.bookingId };
        if (about.kind === "user") {
          const other = me === booking.passengerId ? booking.driverId : booking.passengerId;
          return { context: { kind: "user", userId: other }, links };
        }
        return {
          context: {
            kind: "booking",
            passengerId: booking.passengerId,
            driverId: booking.driverId,
            bookingStatus: booking.status as BookingStatus,
            tripCompletedAt: booking.completedAt,
          },
          links,
        };
      }
      case "review": {
        // As a profile shows it (3.1.1): revealed, not hidden, about a person
        // everyone sees, and not by someone leaving ShareRide.
        const [review] = await db
          .select({
            authorId: reviews.authorId,
            bookingId: reviews.bookingId,
            tripId: bookings.tripId,
          })
          .from(reviews)
          .innerJoin(authors, eq(authors.id, reviews.authorId))
          .innerJoin(subjects, eq(subjects.id, reviews.subjectId))
          .leftJoin(bookings, eq(bookings.id, reviews.bookingId))
          .where(
            and(
              eq(reviews.id, about.reviewId),
              // Hidden with its author until they are erased (spec 11, 3.4.3).
              isNull(authors.deleteAfter),
              isNotNull(reviews.revealedAt),
              isNull(reviews.hiddenAt),
              everyoneSees(subjects),
              isNotNull(subjects.firstName),
            ),
          );
        if (review === undefined) return undefined;
        return {
          context: { kind: "review", authorId: review.authorId },
          links: {
            reviewId: about.reviewId,
            ...(review.bookingId === null ? {} : { bookingId: review.bookingId }),
            ...(review.tripId === null ? {} : { tripId: review.tripId }),
          },
        };
      }
      case "profile": {
        // The person a profile shows: someone everyone sees (spec 1, 3.5).
        const [person] = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.profileId, about.profileId),
              everyoneSees(users),
              isNotNull(users.firstName),
            ),
          );
        if (person === undefined) return undefined;
        return { context: { kind: "user", userId: person.id }, links: {} };
      }
    }
  }

  async function shown(id: string): Promise<MyReport | undefined> {
    const [row] = await mineQuery().where(eq(reports.id, id));
    return row === undefined ? undefined : toMine(row);
  }

  const reported = alias(users, "reported");

  function mineQuery() {
    return db
      .select({
        id: reports.id,
        subject: reports.subject,
        category: reports.category,
        firstName: reported.firstName,
        createdAt: reports.createdAt,
        status: reports.status,
        outcome: reports.outcome,
        closedAt: reports.closedAt,
      })
      .from(reports)
      .leftJoin(reported, eq(reported.id, reports.subjectUserId))
      .$dynamic();
  }

  return {
    async file(me, input) {
      const found = await find(me, input.about);
      if (found === undefined) return err({ code: "not_found" });
      const now = clock();
      const checked = checkReport(
        me,
        found.context,
        { category: input.category, description: input.description },
        now,
        settings,
      );
      if (!checked.ok) {
        const { error } = checked;
        // Someone else's: as if it did not exist.
        return err(error.code === "not_involved" ? { code: "not_found" } : error);
      }

      const filed = await db.transaction(async (tx) => {
        // One report at a time per person, so the daily limit holds. Not a
        // full update lock: the insert's key check on the person reported
        // must not wait on theirs, or two people reporting each other at
        // once would deadlock.
        await tx.select({ id: users.id }).from(users).where(eq(users.id, me)).for("no key update");
        const today = await tx
          .select({ at: reports.createdAt })
          .from(reports)
          .where(
            and(eq(reports.reporterId, me), gt(reports.createdAt, new Date(now.getTime() - dayMs))),
          )
          .orderBy(asc(reports.createdAt));
        if (reportLimitReached(today.length, settings)) {
          const oldest = today[0]?.at ?? now;
          const retryAfterSeconds = Math.ceil((oldest.getTime() + dayMs - now.getTime()) / 1000);
          return err({ code: "too_many_reports", retryAfterSeconds } as const);
        }
        const [row] = await tx
          .insert(reports)
          .values({
            reporterId: me,
            // The former member stands for erased accounts: nobody to act on.
            subjectUserId:
              checked.value.subjectUserId === formerMemberId ? null : checked.value.subjectUserId,
            subject: found.context.kind,
            ...found.links,
            category: input.category,
            description: checked.value.description,
            urgent: checked.value.urgent,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: reports.id });
        if (row === undefined) throw new Error("The report was not stored.");
        // The operator hears of it at once, by push, and by SMS for safety in the day (R9.9).
        await recordEvents(tx, [{ type: "ReportFiled", reportId: row.id }], now);
        return ok(row.id);
      });
      if (!filed.ok) return filed;
      const report = await shown(filed.value);
      if (report === undefined) throw new Error("The report was not stored.");
      return ok(report);
    },

    async mine(me) {
      const rows = await mineQuery()
        .where(eq(reports.reporterId, me))
        .orderBy(desc(reports.createdAt), desc(reports.id));
      return rows.map(toMine);
    },
  };
}

function toMine(row: {
  id: string;
  subject: string;
  category: string;
  firstName: string | null;
  createdAt: Date;
  status: string;
  outcome: string | null;
  closedAt: Date | null;
}): MyReport {
  return {
    id: row.id,
    kind: row.subject as MyReport["kind"],
    category: row.category as MyReport["category"],
    firstName: row.firstName,
    filedAt: row.createdAt.toISOString(),
    status: row.status as MyReport["status"],
    outcome: row.outcome as MyReport["outcome"],
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}
