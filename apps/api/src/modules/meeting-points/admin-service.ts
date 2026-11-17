import type {
  AdminMeetingPoint,
  AdminMeetingPointInput,
  AdminMeetingPointListItem,
} from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  changedFields,
  err,
  icelandDate,
  matchesConsoleFilters,
  monthInIceland,
  nextPointStatus,
  ok,
  reviewDueOn,
  reviewedOn,
  searchTextFor,
  validateMeetingPointDraft,
  validatePause,
  type ConsoleFilters,
  type DraftProblem,
  type MeetingPointStatus,
  type PauseProblem,
  type PauseRequest,
  type Result,
  type StatusChange,
  type ValidMeetingPointDraft,
} from "@shareride/domain";
import { eq, sql } from "drizzle-orm";
import { recordAudit, type AuditRequest } from "../admin/audit.ts";
import type { Transaction } from "../bookings/seats.ts";
import { recordEvents } from "../notifications/outbox.ts";
import { futureTripsAt } from "./status.ts";

const { meetingPoints } = schema;

type MeetingPointRow = typeof meetingPoints.$inferSelect;

/** The operator acting, and the request, for the audit entry. */
export interface ConsoleActor {
  readonly operator: { readonly userId: string; readonly sessionId: string };
  readonly request: AuditRequest;
}

export type UpdateProblem =
  | { readonly code: "validation_failed"; readonly problems: readonly DraftProblem[] }
  | { readonly code: "not_found" | "meeting_point_changed" | "meeting_point_retired" }
  | { readonly code: "move_needed" };

export type StatusProblem =
  | { readonly code: "validation_failed"; readonly problems: readonly PauseProblem[] }
  | { readonly code: "not_found" | "meeting_point_changed" | "status_change_not_allowed" };

/** The point's `updatedAt` when the console loaded it. */
interface Loaded {
  readonly updatedAt: string;
}

export interface MeetingPointAdminService {
  list(filters: ConsoleFilters): Promise<AdminMeetingPointListItem[]>;
  get(id: string): Promise<AdminMeetingPoint | undefined>;
  create(
    input: AdminMeetingPointInput,
    actor: ConsoleActor,
  ): Promise<Result<AdminMeetingPoint, readonly DraftProblem[]>>;
  /** `updatedAt` is the point's when the form loaded it. */
  update(
    id: string,
    input: AdminMeetingPointInput & Loaded,
    actor: ConsoleActor,
  ): Promise<Result<AdminMeetingPoint, UpdateProblem>>;
  /**
   * Pauses an active point (spec 2, 3.6.4): new trips cannot use it, and
   * the drivers and passengers of its future trips are told.
   */
  pause(
    id: string,
    input: PauseRequest & Loaded,
    actor: ConsoleActor,
  ): Promise<Result<AdminMeetingPoint, StatusProblem>>;
  /** Brings a paused point back into use before its end date, or without one. */
  resume(
    id: string,
    input: Loaded,
    actor: ConsoleActor,
  ): Promise<Result<AdminMeetingPoint, StatusProblem>>;
  /** Retires a point for good (3.6.5): at once, or after its last future trip. */
  retire(
    id: string,
    input: Loaded,
    actor: ConsoleActor,
  ): Promise<Result<AdminMeetingPoint, StatusProblem>>;
}

const sixDecimals = (degrees: number) => Math.round(degrees * 1e6) / 1e6;

const samePosition = (a: MeetingPointRow["location"], b: MeetingPointRow["location"]) =>
  sixDecimals(a.latitude) === sixDecimals(b.latitude) &&
  sixDecimals(a.longitude) === sixDecimals(b.longitude);

export function toAdminMeetingPoint(row: MeetingPointRow, futureTrips: number): AdminMeetingPoint {
  return {
    id: row.id,
    nameIs: row.nameIs,
    nameEn: row.nameEn,
    aliases: row.aliases,
    position: row.location,
    region: row.region as AdminMeetingPoint["region"],
    municipality: row.municipality,
    type: row.type as AdminMeetingPoint["type"],
    amenities: row.amenities as AdminMeetingPoint["amenities"],
    whereToStandIs: row.whereToStandIs,
    whereToStandEn: row.whereToStandEn,
    shelterHours: row.shelterHours === null ? null : [...row.shelterHours],
    shelterNoteIs: row.shelterNoteIs,
    shelterNoteEn: row.shelterNoteEn,
    season:
      row.seasonStartMonth === null || row.seasonEndMonth === null
        ? null
        : { startMonth: row.seasonStartMonth, endMonth: row.seasonEndMonth },
    status: row.status as AdminMeetingPoint["status"],
    pauseReason:
      row.pauseReasonIs === null
        ? null
        : { is: row.pauseReasonIs, en: row.pauseReasonEn ?? row.pauseReasonIs },
    pausedUntil: row.pausedUntil,
    lastCheckedOn: row.lastCheckedOn,
    reviewDueOn: row.reviewDueOn,
    amenitiesReviewedOn: row.amenitiesReviewedOn,
    seasonReviewedOn: row.seasonReviewedOn,
    sample: row.sample,
    futureTrips,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toListItem(row: MeetingPointRow): AdminMeetingPointListItem {
  const point = toAdminMeetingPoint(row, 0);
  return {
    id: point.id,
    nameIs: point.nameIs,
    nameEn: point.nameEn,
    position: point.position,
    region: point.region,
    municipality: point.municipality,
    type: point.type,
    season: point.season,
    status: point.status,
    reviewDueOn: point.reviewDueOn,
    sample: point.sample,
    updatedAt: point.updatedAt,
  };
}

/** The columns the console edits, from a checked draft. */
function columnsOf(
  draft: ValidMeetingPointDraft,
  reviewed: {
    readonly amenitiesReviewedOn: string | null;
    readonly seasonReviewedOn: string | null;
  },
) {
  return {
    nameIs: draft.nameIs,
    nameEn: draft.nameEn,
    aliases: [...draft.aliases],
    location: draft.position,
    region: draft.region,
    municipality: draft.municipality,
    type: draft.type,
    amenities: [...draft.amenities],
    whereToStandIs: draft.whereToStandIs,
    whereToStandEn: draft.whereToStandEn,
    shelterHours: draft.shelterHours,
    shelterNoteIs: draft.shelterNoteIs,
    shelterNoteEn: draft.shelterNoteEn,
    seasonStartMonth: draft.season?.startMonth ?? null,
    seasonEndMonth: draft.season?.endMonth ?? null,
    lastCheckedOn: draft.lastCheckedOn,
    ...reviewed,
    searchText: searchTextFor([draft.nameIs, draft.nameEn, ...draft.aliases]),
  };
}

/**
 * What an audit entry holds of a point: the fields the console edits, as
 * the console shows them. A meeting point is a public place the operator
 * chose, not a person's record (spec 9, section 7).
 */
function auditValuesOf(point: AdminMeetingPoint): Record<string, unknown> {
  return {
    nameIs: point.nameIs,
    nameEn: point.nameEn,
    aliases: point.aliases,
    position: point.position,
    region: point.region,
    municipality: point.municipality,
    type: point.type,
    amenities: point.amenities,
    whereToStandIs: point.whereToStandIs,
    whereToStandEn: point.whereToStandEn,
    shelterHours: point.shelterHours,
    shelterNoteIs: point.shelterNoteIs,
    shelterNoteEn: point.shelterNoteEn,
    season: point.season,
    lastCheckedOn: point.lastCheckedOn,
    amenitiesReviewedOn: point.amenitiesReviewedOn,
    seasonReviewedOn: point.seasonReviewedOn,
  };
}

const collator = new Intl.Collator("is");

/** The console's meeting points (spec 2, 3.6.1 and 3.6.2). */
export function createMeetingPointAdminService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
}): MeetingPointAdminService {
  const { db, clock } = dependencies;

  return {
    // A few hundred points at most, so the domain's filters run on all of them.
    async list(filters) {
      const now = clock();
      const at = { month: monthInIceland(now), today: icelandDate(now) };
      const rows = await db.select().from(meetingPoints);
      return rows
        .filter((row) => matchesConsoleFilters(row, filters, at))
        .sort((a, b) => collator.compare(a.nameIs, b.nameIs) || a.id.localeCompare(b.id))
        .map(toListItem);
    },

    async get(id) {
      const [row] = await db.select().from(meetingPoints).where(eq(meetingPoints.id, id));
      if (row === undefined) return undefined;
      return toAdminMeetingPoint(row, (await futureTripsAt(db, id, clock())).length);
    },

    async create(input, actor) {
      const today = icelandDate(clock());
      const checked = validateMeetingPointDraft(input, today);
      if (!checked.ok) return checked;
      const columns = columnsOf(checked.value, {
        amenitiesReviewedOn: reviewedOn(null, input.amenitiesReviewed, today),
        seasonReviewedOn: reviewedOn(null, input.seasonReviewed, today),
      });
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(meetingPoints)
          .values({ ...columns, status: "draft" })
          .returning();
        if (row === undefined) throw new Error("The meeting point was not saved.");
        // A new draft, so no trip stops there yet.
        const point = toAdminMeetingPoint(row, 0);
        await recordAudit(tx, {
          operator: actor.operator,
          action: "meeting_point.created",
          subjectType: "meeting_point",
          subjectId: point.id,
          after: { ...auditValuesOf(point), status: point.status },
          request: actor.request,
        });
        return ok(point);
      });
    },

    async update(id, input, actor) {
      const today = icelandDate(clock());
      const checked = validateMeetingPointDraft(input, today);
      if (!checked.ok) return err({ code: "validation_failed", problems: checked.error });
      const draft = checked.value;

      return db.transaction(async (tx): Promise<Result<AdminMeetingPoint, UpdateProblem>> => {
        const found = await loadForChange(tx, id, input.updatedAt);
        if (found === undefined) return err({ code: "not_found" });
        const { row } = found;
        if (row.status === "retired") return err({ code: "meeting_point_retired" });
        if (!found.loaded) return err({ code: "meeting_point_changed" });
        const moved = !samePosition(row.location, draft.position);
        if (moved && row.status !== "draft") return err({ code: "move_needed" });

        const futureTrips = (await futureTripsAt(tx, id, clock())).length;
        const before = toAdminMeetingPoint(row, futureTrips);
        const columns = columnsOf(
          { ...draft, position: moved ? draft.position : row.location },
          {
            amenitiesReviewedOn: reviewedOn(
              row.amenitiesReviewedOn,
              input.amenitiesReviewed,
              today,
            ),
            seasonReviewedOn: reviewedOn(row.seasonReviewedOn, input.seasonReviewed, today),
          },
        );
        const unsaved = toAdminMeetingPoint(
          {
            ...row,
            ...columns,
            reviewDueOn: reviewDueOn(row.status as MeetingPointStatus, columns.lastCheckedOn),
          },
          futureTrips,
        );
        const changes = changedFields(auditValuesOf(before), auditValuesOf(unsaved));
        if (Object.keys(changes.after).length === 0) return ok(before);

        const [saved] = await tx
          .update(meetingPoints)
          .set({ ...columns, reviewDueOn: unsaved.reviewDueOn, updatedAt: changedNow })
          .where(eq(meetingPoints.id, id))
          .returning();
        if (saved === undefined) throw new Error("The meeting point was not saved.");
        await recordAudit(tx, {
          operator: actor.operator,
          action: "meeting_point.updated",
          subjectType: "meeting_point",
          subjectId: id,
          ...changes,
          request: actor.request,
        });
        return ok(toAdminMeetingPoint(saved, futureTrips));
      });
    },

    pause(id, input, actor) {
      const checked = validatePause(input, icelandDate(clock()));
      if (!checked.ok) {
        return Promise.resolve(err({ code: "validation_failed", problems: checked.error }));
      }
      const { reasonIs, reasonEn, until } = checked.value;
      return changeStatus(id, input, actor, "pause", async (tx, futureTrips) => {
        // One event per trip: the worker tells its driver once, and each
        // passenger who gets in or out here once (spec 2, 3.6.4). The trips
        // themselves are not changed or cancelled.
        await recordEvents(
          tx,
          futureTrips.map((tripId) => ({
            type: "MeetingPointChanged",
            tripId,
            meetingPointId: id,
          })),
          clock(),
        );
        return { pauseReasonIs: reasonIs, pauseReasonEn: reasonEn, pausedUntil: until };
      });
    },

    resume(id, input, actor) {
      return changeStatus(id, input, actor, "resume", () =>
        Promise.resolve({ pauseReasonIs: null, pauseReasonEn: null, pausedUntil: null }),
      );
    },

    retire(id, input, actor) {
      // A point retired while paused keeps its reason: the trips still to
      // stop there need another stop all the same, and their news names it.
      return changeStatus(id, input, actor, "retire", (_tx, _trips, row) =>
        Promise.resolve({
          pauseReasonIs: row.pauseReasonIs,
          pauseReasonEn: row.pauseReasonEn,
          pausedUntil: null,
        }),
      );
    },
  };

  /**
   * One status change in one transaction with its audit entry, refused on
   * a copy older than the point's. `alongside` adds the change's own
   * columns, and its events, in the same transaction.
   */
  function changeStatus(
    id: string,
    input: Loaded,
    actor: ConsoleActor,
    change: StatusChange,
    alongside: (
      tx: Transaction,
      futureTrips: readonly string[],
      row: MeetingPointRow,
    ) => Promise<Pick<MeetingPointRow, "pauseReasonIs" | "pauseReasonEn" | "pausedUntil">>,
  ): Promise<Result<AdminMeetingPoint, StatusProblem>> {
    return db.transaction(async (tx): Promise<Result<AdminMeetingPoint, StatusProblem>> => {
      const found = await loadForChange(tx, id, input.updatedAt);
      if (found === undefined) return err({ code: "not_found" });
      if (!found.loaded) return err({ code: "meeting_point_changed" });
      const { row } = found;
      const futureTrips = await futureTripsAt(tx, id, clock());
      const status = nextPointStatus(row.status as MeetingPointStatus, change, futureTrips.length);
      if (!status.ok) return err({ code: "status_change_not_allowed" });
      const columns = await alongside(tx, futureTrips, row);
      const [saved] = await tx
        .update(meetingPoints)
        .set({
          ...columns,
          status: status.value,
          reviewDueOn: reviewDueOn(status.value, row.lastCheckedOn),
          updatedAt: changedNow,
        })
        .where(eq(meetingPoints.id, id))
        .returning();
      if (saved === undefined) throw new Error("The meeting point was not saved.");
      const before = toAdminMeetingPoint(row, futureTrips.length);
      const after = toAdminMeetingPoint(saved, futureTrips.length);
      const changes = changedFields(statusValuesOf(before), statusValuesOf(after));
      await recordAudit(tx, {
        operator: actor.operator,
        action: `meeting_point.${auditActions[change]}`,
        subjectType: "meeting_point",
        subjectId: id,
        before: changes.before,
        // How many trips were still to stop there: told of a pause, waited for by a retirement.
        after: { ...changes.after, futureTrips: futureTrips.length },
        request: actor.request,
      });
      return ok(after);
    });
  }
}

/** Later than the copy the console loaded, even within one millisecond. */
const changedNow = sql`greatest(now(), ${meetingPoints.updatedAt} + interval '1 millisecond')`;

/**
 * The point, locked for the change, and whether it is the copy the console
 * loaded: compared in SQL, as that copy has its time to the millisecond only.
 */
async function loadForChange(tx: Transaction, id: string, updatedAt: string) {
  const [found] = await tx
    .select({
      row: meetingPoints,
      loaded: sql<boolean>`date_trunc('milliseconds', ${meetingPoints.updatedAt}) = ${updatedAt}::timestamptz`,
    })
    .from(meetingPoints)
    .where(eq(meetingPoints.id, id))
    .for("update");
  return found;
}

const auditActions = {
  pause: "paused",
  resume: "resumed",
  retire: "retired",
} as const satisfies Record<StatusChange, string>;

/** What a status change's audit entry compares: the status, the pause and the review date. */
function statusValuesOf(point: AdminMeetingPoint): Record<string, unknown> {
  return {
    status: point.status,
    pauseReason: point.pauseReason,
    pausedUntil: point.pausedUntil,
    reviewDueOn: point.reviewDueOn,
  };
}
