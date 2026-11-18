import type {
  AdminActivationChecklist,
  AdminImportRow,
  AdminMeetingPoint,
  AdminMeetingPointInput,
  AdminMeetingPointListItem,
} from "@shareride/contracts";
import { lockLegs, schema, type Database } from "@shareride/db";
import {
  activationChecklist,
  changedFields,
  err,
  icelandDate,
  matchesConsoleFilters,
  monthInIceland,
  nextPointStatus,
  ok,
  readMeetingPointImport,
  readyToActivate,
  reviewDueOn,
  reviewedOn,
  searchTextFor,
  validateMeetingPointDraft,
  validatePause,
  type ActivationItem,
  type ConsoleFilters,
  type DraftProblem,
  type ImportFileProblem,
  type ImportRow,
  type MeetingPointStatus,
  type PauseProblem,
  type PauseRequest,
  type Result,
  type StatusChange,
  type ValidMeetingPointDraft,
} from "@shareride/domain";
import { count, eq, ne, sql } from "drizzle-orm";
import { recordAudit, type AuditRequest } from "../admin/audit.ts";
import type { Transaction } from "../bookings/seats.ts";
import { recordEvents } from "../notifications/outbox.ts";
import type { LegService } from "./legs.ts";
import { futureTripsAt } from "./status.ts";

const { meetingPointIssues, meetingPointPhotos, meetingPoints } = schema;

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
  | { readonly code: "not_found" | "meeting_point_changed" | "status_change_not_allowed" }
  | { readonly code: "activation_not_ready"; readonly missing: readonly ActivationItem[] };

/** A file's rows as the console shows them, and how many became drafts. */
export interface ImportResult {
  readonly rows: readonly AdminImportRow[];
  readonly added: number;
}

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
  /** The point's activation checklist (R2.3), or undefined for no such point. */
  activationChecklist(id: string): Promise<AdminActivationChecklist | undefined>;
  /**
   * Activates a draft whose checklist passes (spec 2, 3.6.3), computing its
   * legs with every point in service in the same transaction.
   */
  activate(
    id: string,
    input: Loaded,
    actor: ConsoleActor,
  ): Promise<Result<AdminMeetingPoint, StatusProblem>>;
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
  /**
   * Reads a CSV file of points (spec 2, 3.6.9) and says what each row
   * would be; with `save`, adds the rows without problems as drafts, in one
   * transaction with one audit entry.
   */
  importFile(
    file: string,
    save: boolean,
    actor: ConsoleActor,
  ): Promise<Result<ImportResult, readonly ImportFileProblem[]>>;
}

/** A row of an import as the console shows it, with its new ID once saved. */
function importRowOf(row: ImportRow, id: string | null): AdminImportRow {
  if (!row.ok) {
    return { line: row.line, nameIs: row.nameIs, point: null, problems: [...row.problems], id };
  }
  const { draft } = row;
  return {
    line: row.line,
    nameIs: row.nameIs,
    point: {
      nameEn: draft.nameEn,
      aliases: [...draft.aliases],
      position: draft.position,
      region: draft.region,
      municipality: draft.municipality,
      type: draft.type,
      amenities: [...draft.amenities],
      whereToStandIs: draft.whereToStandIs,
      whereToStandEn: draft.whereToStandEn,
      season: draft.season,
    },
    problems: [],
    id,
  };
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

function toListItem(row: MeetingPointRow & { openIssues: number }): AdminMeetingPointListItem {
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
    openIssues: row.openIssues,
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
  readonly legs: LegService;
}): MeetingPointAdminService {
  const { db, clock, legs } = dependencies;

  /** The checklist of a point as it is in `q`. */
  async function checklistOf(q: Database | Transaction, row: MeetingPointRow) {
    const photos = await q
      .select({
        descriptionIs: meetingPointPhotos.descriptionIs,
        descriptionEn: meetingPointPhotos.descriptionEn,
      })
      .from(meetingPointPhotos)
      .where(eq(meetingPointPhotos.meetingPointId, row.id));
    return activationChecklist(row, photos, {
      connected: await legs.connects(row.id, row.location, q),
    });
  }

  return {
    // A few hundred points at most, so the domain's filters run on all of them.
    async list(filters) {
      const now = clock();
      const at = { month: monthInIceland(now), today: icelandDate(now) };
      const rows = await db.select().from(meetingPoints);
      const reported = await db
        .select({ id: meetingPointIssues.meetingPointId, count: count() })
        .from(meetingPointIssues)
        .where(eq(meetingPointIssues.status, "open"))
        .groupBy(meetingPointIssues.meetingPointId);
      const openIssues = new Map(reported.map((row) => [row.id, row.count]));
      return rows
        .map((row) => ({ ...row, openIssues: openIssues.get(row.id) ?? 0 }))
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

    async importFile(file, save, actor) {
      const today = icelandDate(clock());
      // A retired point's name may be used again.
      const read = async (executor: Database | Transaction) => {
        const names = await executor
          .select({ nameIs: meetingPoints.nameIs, nameEn: meetingPoints.nameEn })
          .from(meetingPoints)
          .where(ne(meetingPoints.status, "retired"));
        return readMeetingPointImport(file, {
          today,
          existingNames: names.flatMap(({ nameIs, nameEn }) =>
            nameEn === null ? [nameIs] : [nameIs, nameEn],
          ),
        });
      };
      const unsaved = (rows: readonly ImportRow[]) => ({
        rows: rows.map((row) => importRowOf(row, null)),
        added: 0,
      });

      if (!save) {
        const checked = await read(db);
        return checked.ok ? ok(unsaved(checked.value)) : checked;
      }
      return db.transaction(async (tx) => {
        // One import at a time, so two cannot both add the same name.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('meeting_point.import'))`);
        const found = await read(tx);
        if (!found.ok) return found;
        const rows = found.value;
        if (!rows.some((row) => row.ok)) return ok(unsaved(rows));
        const unreviewed = { amenitiesReviewedOn: null, seasonReviewedOn: null };
        // One at a time, in the file's order, so each row gets its own ID.
        const idOf = new Map<ImportRow, string>();
        for (const row of rows) {
          if (!row.ok) continue;
          const [point] = await tx
            .insert(meetingPoints)
            .values({ ...columnsOf(row.draft, unreviewed), status: "draft" })
            .returning({ id: meetingPoints.id });
          if (point === undefined) throw new Error("The draft was not saved.");
          idOf.set(row, point.id);
        }
        const added = rows.flatMap((row) => {
          const id = idOf.get(row);
          return id === undefined ? [] : [{ id, nameIs: row.nameIs }];
        });
        await recordAudit(tx, {
          operator: actor.operator,
          action: "meeting_point.imported",
          subjectType: "meeting_point",
          after: { added: added.length, skipped: rows.length - added.length, points: added },
          request: actor.request,
        });
        return ok({
          rows: rows.map((row) => importRowOf(row, idOf.get(row) ?? null)),
          added: added.length,
        });
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

    async activationChecklist(id) {
      const [row] = await db.select().from(meetingPoints).where(eq(meetingPoints.id, id));
      if (row === undefined) return undefined;
      const items = await checklistOf(db, row);
      return { items, ready: readyToActivate(items) };
    },

    activate(id, input, actor) {
      return db.transaction(async (tx): Promise<Result<AdminMeetingPoint, StatusProblem>> => {
        // The legs lock before the point's row, in the order the sample seed
        // takes them, so neither waits for the other for ever.
        await lockLegs(tx);
        const found = await loadForChange(tx, id, input.updatedAt);
        if (found === undefined) return err({ code: "not_found" });
        if (!found.loaded) return err({ code: "meeting_point_changed" });
        const { row } = found;
        const status = nextPointStatus(row.status as MeetingPointStatus, "activate", 0);
        if (!status.ok) return err({ code: "status_change_not_allowed" });
        const missing = (await checklistOf(tx, row))
          .filter((check) => !check.done)
          .map((check) => check.item);
        if (missing.length > 0) return err({ code: "activation_not_ready", missing });

        const [saved] = await tx
          .update(meetingPoints)
          .set({
            status: status.value,
            reviewDueOn: reviewDueOn(status.value, row.lastCheckedOn),
            updatedAt: changedNow,
          })
          .where(eq(meetingPoints.id, id))
          .returning();
        if (saved === undefined) throw new Error("The meeting point was not saved.");
        const computed = await legs.computeFor(id, tx);
        if (!computed.ok) throw new Error("The meeting point was not found for its legs.");
        // A draft has no trips: none can use it.
        const before = toAdminMeetingPoint(row, 0);
        const after = toAdminMeetingPoint(saved, 0);
        const changes = changedFields(statusValuesOf(before), statusValuesOf(after));
        await recordAudit(tx, {
          operator: actor.operator,
          action: "meeting_point.activated",
          subjectType: "meeting_point",
          subjectId: id,
          before: changes.before,
          // Its legs, and those no road connects (3.7.4).
          after: { ...changes.after, legs: computed.value.legs, missing: computed.value.missing },
          request: actor.request,
        });
        return ok(after);
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
    // Activating has its checklist and legs: `activate`.
    change: Exclude<StatusChange, "activate">,
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
/** Later than any copy the console loaded, so an edit from one is refused. */
export const changedNow = sql`greatest(now(), ${meetingPoints.updatedAt} + interval '1 millisecond')`;

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
} as const satisfies Record<Exclude<StatusChange, "activate">, string>;

/** What a status change's audit entry compares: the status, the pause and the review date. */
function statusValuesOf(point: AdminMeetingPoint): Record<string, unknown> {
  return {
    status: point.status,
    pauseReason: point.pauseReason,
    pausedUntil: point.pausedUntil,
    reviewDueOn: point.reviewDueOn,
  };
}
