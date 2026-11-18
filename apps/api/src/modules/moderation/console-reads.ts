// What the console reads about people, reports, actions and trips, shared
// by the reports pages (PR 7) and the users and trips pages (PR 8) of
// milestone 9, so each shows a person, a report or a stop the same way.
import type { AdminModerationAction, AdminPerson, AdminReportListItem } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  responseDueAt,
  type AppealOutcome,
  type ModeratedContent,
  type ModerationActionKind,
  type ModerationRule,
  type ReportCategory,
  type ReportOutcome,
  type ReportStatus,
  type ReportSubject,
  type SafetySettings,
} from "@shareride/domain";
import { asc, desc, eq, inArray, type SQL } from "drizzle-orm";

const { meetingPoints, moderationActions, tripStops, users } = schema;

export const iso = (at: Date | null) => at?.toISOString() ?? null;

const nameOf = (point: { nameIs: string; nameEn: string | null }) => ({
  is: point.nameIs,
  en: point.nameEn ?? point.nameIs,
});

export type ReportRow = typeof schema.reports.$inferSelect;
export type ActionRow = typeof moderationActions.$inferSelect;

export function createConsoleReads(dependencies: {
  readonly db: Database;
  readonly settings: SafetySettings;
}) {
  const { db, settings } = dependencies;

  /** The people these IDs name, as the console shows them. */
  async function peopleOf(ids: readonly (string | null)[]): Promise<Map<string, AdminPerson>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    if (wanted.length === 0) return new Map();
    const rows = await db
      .select({
        userId: users.id,
        firstName: users.firstName,
        status: users.status,
        suspendedUntil: users.suspendedUntil,
        locale: users.locale,
      })
      .from(users)
      .where(inArray(users.id, wanted));
    return new Map(
      rows.map((row) => [
        row.userId,
        {
          userId: row.userId,
          firstName: row.status === "deleted" ? null : row.firstName,
          status: row.status as AdminPerson["status"],
          suspendedUntil: iso(row.suspendedUntil),
          locale: row.locale as AdminPerson["locale"],
        },
      ]),
    );
  }

  async function listItems(rows: readonly ReportRow[]): Promise<AdminReportListItem[]> {
    const people = await peopleOf(rows.flatMap((row) => [row.reporterId, row.subjectUserId]));
    const of = (id: string | null) => (id === null ? null : (people.get(id) ?? null));
    return rows.map((row) => ({
      id: row.id,
      subject: row.subject as ReportSubject,
      category: row.category as ReportCategory,
      urgent: row.urgent,
      status: row.status as ReportStatus,
      outcome: row.outcome as ReportOutcome | null,
      filedAt: row.createdAt.toISOString(),
      dueAt: responseDueAt(row.createdAt, settings).toISOString(),
      closedAt: iso(row.closedAt),
      reporter: of(row.reporterId),
      reported: of(row.subjectUserId),
    }));
  }

  async function actionsOf(rows: readonly ActionRow[]): Promise<AdminModerationAction[]> {
    const people = await peopleOf(rows.map((row) => row.userId));
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as ModerationActionKind,
      person: row.userId === null ? null : (people.get(row.userId) ?? null),
      reportId: row.reportId,
      rule: row.rule as ModerationRule | null,
      reason: row.reason,
      content:
        row.contentKind === null || row.contentId === null
          ? null
          : { kind: row.contentKind as ModeratedContent, id: row.contentId },
      until: iso(row.until),
      at: row.createdAt.toISOString(),
      appeal:
        row.appealText === null || row.appealedAt === null
          ? null
          : {
              text: row.appealText,
              sentAt: row.appealedAt.toISOString(),
              answer: row.appealAnswer,
              outcome: row.appealOutcome as AppealOutcome | null,
              answeredAt: iso(row.appealAnsweredAt),
            },
    }));
  }

  async function actionsWhere(where: SQL | undefined, latestFirst: boolean, limit?: number) {
    const query = db
      .select()
      .from(moderationActions)
      .where(where)
      .orderBy(
        ...(latestFirst
          ? [desc(moderationActions.createdAt), desc(moderationActions.id)]
          : [asc(moderationActions.createdAt), asc(moderationActions.id)]),
      )
      .$dynamic();
    return actionsOf(await (limit === undefined ? query : query.limit(limit)));
  }

  /** The stops of these trips, in order, with their names; removed ones too. */
  async function stopsOf(tripIds: readonly string[]) {
    if (tripIds.length === 0) return [];
    return db
      .select({
        id: tripStops.id,
        tripId: tripStops.tripId,
        plannedAt: tripStops.plannedAt,
        removedAt: tripStops.removedAt,
        nameIs: meetingPoints.nameIs,
        nameEn: meetingPoints.nameEn,
      })
      .from(tripStops)
      .innerJoin(meetingPoints, eq(meetingPoints.id, tripStops.meetingPointId))
      .where(inArray(tripStops.tripId, [...new Set(tripIds)]))
      .orderBy(asc(tripStops.tripId), asc(tripStops.position));
  }

  type Stop = Awaited<ReturnType<typeof stopsOf>>[number];
  const shownStop = (stop: Stop | undefined) => ({
    name: stop === undefined ? { is: "", en: "" } : nameOf(stop),
    plannedAt: iso(stop?.plannedAt ?? null),
  });

  /** A trip's whole route: its first and last stops still on it. */
  function routeOf(stops: readonly Stop[], tripId: string) {
    const kept = stops.filter((stop) => stop.tripId === tripId && stop.removedAt === null);
    return { from: shownStop(kept[0]), to: shownStop(kept.at(-1)) };
  }

  return { peopleOf, listItems, actionsOf, actionsWhere, stopsOf, shownStop, routeOf };
}

export type ConsoleReads = ReturnType<typeof createConsoleReads>;
/** A trip's stop with its meeting point's names, as `stopsOf` reads it. */
export type ConsoleStop = Awaited<ReturnType<ConsoleReads["stopsOf"]>>[number];
