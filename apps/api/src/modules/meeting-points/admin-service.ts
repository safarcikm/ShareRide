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
  ok,
  reviewedOn,
  searchTextFor,
  validateMeetingPointDraft,
  type ConsoleFilters,
  type DraftProblem,
  type Result,
  type ValidMeetingPointDraft,
} from "@shareride/domain";
import { eq, sql } from "drizzle-orm";
import { recordAudit, type AuditRequest } from "../admin/audit.ts";

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
    input: AdminMeetingPointInput & { readonly updatedAt: string },
    actor: ConsoleActor,
  ): Promise<Result<AdminMeetingPoint, UpdateProblem>>;
}

const sixDecimals = (degrees: number) => Math.round(degrees * 1e6) / 1e6;

const samePosition = (a: MeetingPointRow["location"], b: MeetingPointRow["location"]) =>
  sixDecimals(a.latitude) === sixDecimals(b.latitude) &&
  sixDecimals(a.longitude) === sixDecimals(b.longitude);

export function toAdminMeetingPoint(row: MeetingPointRow): AdminMeetingPoint {
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toListItem(row: MeetingPointRow): AdminMeetingPointListItem {
  const point = toAdminMeetingPoint(row);
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
      return row === undefined ? undefined : toAdminMeetingPoint(row);
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
        const point = toAdminMeetingPoint(row);
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
        // Compared in SQL: the copy the form loaded has its time to the millisecond only.
        const [found] = await tx
          .select({
            row: meetingPoints,
            loaded: sql<boolean>`date_trunc('milliseconds', ${meetingPoints.updatedAt}) = ${input.updatedAt}::timestamptz`,
          })
          .from(meetingPoints)
          .where(eq(meetingPoints.id, id))
          .for("update");
        if (found === undefined) return err({ code: "not_found" });
        const { row } = found;
        if (row.status === "retired") return err({ code: "meeting_point_retired" });
        if (!found.loaded) return err({ code: "meeting_point_changed" });
        const moved = !samePosition(row.location, draft.position);
        if (moved && row.status !== "draft") return err({ code: "move_needed" });

        const before = toAdminMeetingPoint(row);
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
        const unsaved = toAdminMeetingPoint({ ...row, ...columns });
        const changes = changedFields(auditValuesOf(before), auditValuesOf(unsaved));
        if (Object.keys(changes.after).length === 0) return ok(before);

        const [saved] = await tx
          .update(meetingPoints)
          .set({
            ...columns,
            // Always later than the copy the form loaded, even within one millisecond.
            updatedAt: sql`greatest(now(), ${meetingPoints.updatedAt} + interval '1 millisecond')`,
          })
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
        return ok(toAdminMeetingPoint(saved));
      });
    },
  };
}
