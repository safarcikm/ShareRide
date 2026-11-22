// Files in photo storage that nobody has any more (ADR 0033): a profile
// photo replaced or removed, an erased account's photo, or an upload not
// yet saved. Each is queued in the transaction that lets it go, deleted
// at once after the commit when that works, and otherwise by the job
// `photo-files`, which the API runs every minute while storage is on. So a
// person's face never stays in the bucket because one request failed.
import { schema, type Database } from "@shareride/db";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { Logger } from "../../logger.ts";
import type { PhotoStorage } from "../../platform/photo-storage.ts";
import type { Queryable } from "../bookings/seats.ts";

const { photoFilesToDelete } = schema;

/** How long an upload has to be saved before its file is taken as left behind. */
export const unsavedUploadGraceMs = 15 * 60_000;

/** Files the job deletes in one run. */
const batchSize = 50;

/** Queues a file for deletion from `deleteAfter`; queuing it again keeps the earlier time. */
export async function queuePhotoFile(q: Queryable, key: string, deleteAfter: Date): Promise<void> {
  await q.insert(photoFilesToDelete).values({ key, deleteAfter }).onConflictDoNothing();
}

/** Takes a file off the queue: it is a photo again, or already deleted. */
export async function unqueuePhotoFile(q: Queryable, key: string): Promise<void> {
  await q.delete(photoFilesToDelete).where(eq(photoFilesToDelete.key, key));
}

/**
 * Deletes a queued file now, after the commit that let it go. If storage
 * fails, the row stays for the job; the person sees no difference.
 */
export async function deletePhotoFileNow(dependencies: {
  readonly db: Database;
  readonly photos: PhotoStorage;
  readonly logger: Logger;
  readonly key: string;
}): Promise<void> {
  const { db, photos, logger, key } = dependencies;
  try {
    await photos.remove(key);
  } catch (error) {
    logger.warn({ err: error }, "photo file not deleted from storage; the job tries again");
    return;
  }
  await unqueuePhotoFile(db, key);
}

/** How long a run holds the files it took: one failed or cut short is tried again after it. */
export const photoFileLeaseMs = 2 * 60_000;

/**
 * The job: takes up to 50 files whose time has come, moving their time on
 * by the lease so no other run takes them, then deletes each file outside
 * any transaction, and its row once it is gone. Gives how many were deleted.
 */
export async function deleteDuePhotoFiles(dependencies: {
  readonly db: Database;
  readonly photos: PhotoStorage;
  readonly now: Date;
  readonly logger: Logger;
}): Promise<number> {
  const { db, photos, now, logger } = dependencies;
  const leasedUntil = new Date(now.getTime() + photoFileLeaseMs);
  const taken = await db.transaction(async (tx) => {
    const due = await tx
      .select({ key: photoFilesToDelete.key })
      .from(photoFilesToDelete)
      .where(lte(photoFilesToDelete.deleteAfter, now))
      .orderBy(asc(photoFilesToDelete.deleteAfter), asc(photoFilesToDelete.key))
      .limit(batchSize)
      // Skips a row an upload's commit or another run holds; it is still due next time.
      .for("update", { skipLocked: true });
    const keys = due.map((row) => row.key);
    if (keys.length > 0) {
      await tx
        .update(photoFilesToDelete)
        .set({ deleteAfter: leasedUntil })
        .where(inArray(photoFilesToDelete.key, keys));
    }
    return keys;
  });
  let deleted = 0;
  for (const key of taken) {
    try {
      await photos.remove(key);
    } catch (error) {
      logger.warn({ err: error }, "photo file not deleted from storage; trying again later");
      continue;
    }
    // Only the row this run took: an upload saved meanwhile took it off the queue.
    await db
      .delete(photoFilesToDelete)
      .where(and(eq(photoFilesToDelete.key, key), eq(photoFilesToDelete.deleteAfter, leasedUntil)));
    deleted += 1;
  }
  return deleted;
}
