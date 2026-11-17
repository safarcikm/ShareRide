import type { AdminMeetingPointPhoto, MeetingPointPhoto } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  changedFields,
  checkPhotoFile,
  checkPhotoOrder,
  err,
  ok,
  photoLimits,
  validatePhotoDescriptions,
  type PhotoDescriptionProblem,
  type PhotoDescriptions,
  type PhotoFileIssue,
  type Result,
} from "@shareride/domain";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Logger } from "../../logger.ts";
import { newMeetingPointPhotoKey, type PhotoStorage } from "../../platform/photo-storage.ts";
import { recordAudit } from "../admin/audit.ts";
import type { Transaction } from "../bookings/seats.ts";
import type { ConsoleActor } from "./admin-service.ts";

const { meetingPoints, meetingPointPhotos } = schema;

type PhotoRow = typeof meetingPointPhotos.$inferSelect;

/** A problem with a field of a new photo or its descriptions, shown by the field. */
export type PhotoFieldProblem =
  PhotoDescriptionProblem | { readonly field: "file"; readonly issue: PhotoFileIssue };

export type PhotoProblem =
  | { readonly code: "validation_failed"; readonly problems: readonly PhotoFieldProblem[] }
  | {
      readonly code:
        | "not_found"
        | "meeting_point_retired"
        | "too_many_photos"
        | "photo_changed"
        | "photos_changed"
        | "photo_storage_off"
        | "photo_storage_unavailable";
    };

type Photos = Result<AdminMeetingPointPhoto[], PhotoProblem>;

export interface MeetingPointPhotoService {
  /** The point's photos in order, or undefined when there is no such point. */
  list(pointId: string): Promise<AdminMeetingPointPhoto[] | undefined>;
  /** The photos the app shows with a point's details, in order. */
  forApp(pointId: string): Promise<MeetingPointPhoto[]>;
  /** Adds a photo last: `file` is a JPEG as the console wrote it again. */
  add(
    pointId: string,
    input: PhotoDescriptions & { readonly file: Uint8Array<ArrayBuffer> },
    actor: ConsoleActor,
  ): Promise<Photos>;
  /** `updatedAt` is the photo's when the console loaded it. */
  describe(
    pointId: string,
    photoId: string,
    input: PhotoDescriptions & { readonly updatedAt: string },
    actor: ConsoleActor,
  ): Promise<Photos>;
  /** `order` holds every photo of the point once, the first shown first. */
  order(pointId: string, order: readonly string[], actor: ConsoleActor): Promise<Photos>;
  /** Removes a photo, then its file in storage. */
  remove(pointId: string, photoId: string, actor: ConsoleActor): Promise<Photos>;
}

/** What an audit entry holds of a photo: never the file, which stays in storage. */
const auditValuesOf = (row: PhotoRow) => ({
  photoId: row.id,
  descriptionIs: row.descriptionIs,
  descriptionEn: row.descriptionEn,
  width: row.width,
  height: row.height,
});

/** Later than the copy the console loaded, even within one millisecond. */
const changedNow = sql`greatest(now(), ${meetingPointPhotos.updatedAt} + interval '1 millisecond')`;

/**
 * A meeting point's photos (spec 2, 3.6.3): the files in photo storage
 * (ADR 0022), their descriptions, order and audit entries here. Without
 * storage (PHOTO_STORAGE=none) none are taken or shown.
 */
export function createMeetingPointPhotoService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly logger: Logger;
  readonly photos?: PhotoStorage;
  /** Tests may name the files. */
  readonly newKey?: () => string;
}): MeetingPointPhotoService {
  const { db, clock, logger, photos: storage } = dependencies;
  const newKey = dependencies.newKey ?? newMeetingPointPhotoKey;

  async function rowsOf(q: Database | Transaction, pointId: string) {
    return q
      .select()
      .from(meetingPointPhotos)
      .where(eq(meetingPointPhotos.meetingPointId, pointId))
      .orderBy(asc(meetingPointPhotos.position), asc(meetingPointPhotos.id));
  }

  async function toPhotos(rows: readonly PhotoRow[]): Promise<AdminMeetingPointPhoto[]> {
    if (storage === undefined) return [];
    const now = clock();
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        url: await storage.linkTo(row.storageKey, now),
        descriptionIs: row.descriptionIs,
        descriptionEn: row.descriptionEn,
        width: row.width,
        height: row.height,
        updatedAt: row.updatedAt.toISOString(),
      })),
    );
  }

  /** The point, locked so its photos change one at a time. */
  async function lockPoint(tx: Transaction, pointId: string) {
    const [point] = await tx
      .select({ status: meetingPoints.status })
      .from(meetingPoints)
      .where(eq(meetingPoints.id, pointId))
      .for("update");
    return point;
  }

  type Change = (tx: Transaction, rows: PhotoRow[]) => Promise<PhotoProblem | undefined>;

  /** A change to a point's photos in one transaction with its audit entry; the rows after it. */
  function changeRows(pointId: string, act: Change): Promise<Result<PhotoRow[], PhotoProblem>> {
    return db.transaction(async (tx) => {
      const point = await lockPoint(tx, pointId);
      if (point === undefined) return err<PhotoProblem>({ code: "not_found" });
      if (point.status === "retired") return err<PhotoProblem>({ code: "meeting_point_retired" });
      const problem = await act(tx, await rowsOf(tx, pointId));
      if (problem !== undefined) return err(problem);
      return ok(await rowsOf(tx, pointId));
    });
  }

  /** The same, answered with the photos and their links. */
  async function change(pointId: string, act: Change): Promise<Photos> {
    const result = await changeRows(pointId, act);
    return result.ok ? ok(await toPhotos(result.value)) : result;
  }

  /** Deletes a file that no photo points to; one left behind is only wasted space. */
  async function forget(key: string) {
    try {
      await storage?.remove(key);
    } catch (error) {
      logger.warn({ err: error }, "photo file not deleted from storage");
    }
  }

  return {
    async list(pointId) {
      const [point] = await db
        .select({ id: meetingPoints.id })
        .from(meetingPoints)
        .where(eq(meetingPoints.id, pointId));
      if (point === undefined) return undefined;
      return toPhotos(await rowsOf(db, pointId));
    },

    async forApp(pointId) {
      const photos = await toPhotos(await rowsOf(db, pointId));
      return photos.map((photo) => ({
        url: photo.url,
        description: { is: photo.descriptionIs, en: photo.descriptionEn },
        width: photo.width,
        height: photo.height,
      }));
    },

    async add(pointId, input, actor) {
      const problems: PhotoFieldProblem[] = [];
      const descriptions = validatePhotoDescriptions(input);
      if (!descriptions.ok) problems.push(...descriptions.error);
      const file = checkPhotoFile(input.file);
      if (!file.ok) problems.unshift({ field: "file", issue: file.error });
      if (!descriptions.ok || !file.ok) return err({ code: "validation_failed", problems });
      if (storage === undefined) return err({ code: "photo_storage_off" });

      // Checked before the upload, so a refused photo is never stored, and again under the lock.
      const [point] = await db
        .select({ status: meetingPoints.status })
        .from(meetingPoints)
        .where(eq(meetingPoints.id, pointId));
      if (point === undefined) return err({ code: "not_found" });
      if (point.status === "retired") return err({ code: "meeting_point_retired" });
      if ((await rowsOf(db, pointId)).length >= photoLimits.maxPerPoint) {
        return err({ code: "too_many_photos" });
      }

      const key = newKey();
      try {
        await storage.put(key, input.file);
      } catch (error) {
        logger.warn({ err: error }, "photo not stored");
        return err({ code: "photo_storage_unavailable" });
      }
      let saved: Result<PhotoRow[], PhotoProblem>;
      try {
        saved = await changeRows(pointId, async (tx, rows) => {
          if (rows.length >= photoLimits.maxPerPoint) return { code: "too_many_photos" };
          const [row] = await tx
            .insert(meetingPointPhotos)
            .values({
              meetingPointId: pointId,
              storageKey: key,
              ...descriptions.value,
              position: (rows.at(-1)?.position ?? -1) + 1,
              width: file.value.width,
              height: file.value.height,
              bytes: input.file.length,
            })
            .returning();
          if (row === undefined) throw new Error("The photo was not saved.");
          await recordAudit(tx, {
            operator: actor.operator,
            action: "meeting_point.photo_added",
            subjectType: "meeting_point",
            subjectId: pointId,
            after: auditValuesOf(row),
            request: actor.request,
          });
          return undefined;
        });
      } catch (error) {
        await forget(key);
        throw error;
      }
      if (!saved.ok) {
        await forget(key);
        return saved;
      }
      // Saved: from here the file is the photo's, whatever happens to the links.
      return ok(await toPhotos(saved.value));
    },

    describe(pointId, photoId, input, actor) {
      const checked = validatePhotoDescriptions(input);
      if (!checked.ok) {
        return Promise.resolve(err({ code: "validation_failed", problems: checked.error }));
      }
      return change(pointId, async (tx, rows) => {
        const row = rows.find((candidate) => candidate.id === photoId);
        if (row === undefined) return { code: "not_found" };
        const [loaded] = await tx
          .select({
            same: sql<boolean>`date_trunc('milliseconds', ${meetingPointPhotos.updatedAt}) = ${input.updatedAt}::timestamptz`,
          })
          .from(meetingPointPhotos)
          .where(eq(meetingPointPhotos.id, photoId));
        if (loaded?.same !== true) return { code: "photo_changed" };
        const changes = changedFields(
          { descriptionIs: row.descriptionIs, descriptionEn: row.descriptionEn },
          { ...checked.value },
        );
        if (Object.keys(changes.after).length === 0) return undefined;
        await tx
          .update(meetingPointPhotos)
          .set({ ...checked.value, updatedAt: changedNow })
          .where(eq(meetingPointPhotos.id, photoId));
        await recordAudit(tx, {
          operator: actor.operator,
          action: "meeting_point.photo_described",
          subjectType: "meeting_point",
          subjectId: pointId,
          before: { photoId, ...changes.before },
          after: { photoId, ...changes.after },
          request: actor.request,
        });
        return undefined;
      });
    },

    order(pointId, order, actor) {
      return change(pointId, async (tx, rows) => {
        const current = rows.map((row) => row.id);
        if (!checkPhotoOrder(current, order)) return { code: "photos_changed" };
        if (order.every((id, position) => current[position] === id)) return undefined;
        for (const [position, id] of order.entries()) {
          await tx
            .update(meetingPointPhotos)
            .set({ position })
            .where(
              and(eq(meetingPointPhotos.id, id), eq(meetingPointPhotos.meetingPointId, pointId)),
            );
        }
        await recordAudit(tx, {
          operator: actor.operator,
          action: "meeting_point.photos_ordered",
          subjectType: "meeting_point",
          subjectId: pointId,
          before: { order: current },
          after: { order: [...order] },
          request: actor.request,
        });
        return undefined;
      });
    },

    async remove(pointId, photoId, actor) {
      let removedKey: string | undefined;
      const result = await changeRows(pointId, async (tx, rows) => {
        const row = rows.find((candidate) => candidate.id === photoId);
        if (row === undefined) return { code: "not_found" };
        await tx.delete(meetingPointPhotos).where(eq(meetingPointPhotos.id, photoId));
        const left = rows.filter((candidate) => candidate.id !== photoId);
        for (const [position, kept] of left.entries()) {
          if (kept.position !== position) {
            await tx
              .update(meetingPointPhotos)
              .set({ position })
              .where(eq(meetingPointPhotos.id, kept.id));
          }
        }
        await recordAudit(tx, {
          operator: actor.operator,
          action: "meeting_point.photo_removed",
          subjectType: "meeting_point",
          subjectId: pointId,
          before: auditValuesOf(row),
          request: actor.request,
        });
        removedKey = row.storageKey;
        return undefined;
      });
      if (!result.ok) return result;
      // After the commit: a file left behind is only wasted space, a photo without its file is broken.
      if (removedKey !== undefined) await forget(removedKey);
      return ok(await toPhotos(result.value));
    },
  };
}
