// A person's profile photo (spec 1, 3.5; ADR 0033): the file in photo
// storage under a new random key for each photo, the key on the person's
// row. A photo replaced or removed leaves the bucket through the queue in
// photo-files.ts.
import { schema, type Database } from "@shareride/db";
import { checkProfilePhoto, err, ok, type ProfilePhotoIssue, type Result } from "@shareride/domain";
import { eq } from "drizzle-orm";
import type { Logger } from "../../logger.ts";
import { newProfilePhotoKey, type PhotoStorage } from "../../platform/photo-storage.ts";
import {
  deletePhotoFileNow,
  queuePhotoFile,
  unqueuePhotoFile,
  unsavedUploadGraceMs,
} from "./photo-files.ts";

const { users } = schema;

export type ProfilePhotoProblem =
  | { readonly code: "photo_invalid"; readonly issue: ProfilePhotoIssue }
  | { readonly code: "photo_storage_off" | "photo_storage_unavailable" };

export interface ProfilePhotoService {
  /** Adds or replaces the person's photo: `file` is a JPEG as the app wrote it. */
  put(userId: string, file: Uint8Array<ArrayBuffer>): Promise<Result<void, ProfilePhotoProblem>>;
  /** Removes the person's photo, if any, then its file. */
  remove(userId: string): Promise<void>;
}

export function createProfilePhotoService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly logger: Logger;
  readonly photos?: PhotoStorage;
  /** Tests may name the files. */
  readonly newKey?: () => string;
}): ProfilePhotoService {
  const { db, clock, logger, photos } = dependencies;
  const newKey = dependencies.newKey ?? newProfilePhotoKey;

  /**
   * Sets the person's photo key in one transaction: the new key leaves the
   * queue, the old one joins it, due now. Gives the old key, if any.
   */
  async function swap(userId: string, key: string | null): Promise<string | null> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select({ photoKey: users.photoKey })
        .from(users)
        .where(eq(users.id, userId))
        .for("no key update");
      if (row === undefined) throw new Error("The signed-in user does not exist.");
      const old = row.photoKey;
      if (old === key) return null;
      await tx
        .update(users)
        // A new photo is shown again, even after ShareRide hid the last (spec 9, 3.4.3).
        .set({ photoKey: key, photoHiddenAt: null, updatedAt: clock() })
        .where(eq(users.id, userId));
      if (key !== null) await unqueuePhotoFile(tx, key);
      if (old !== null) await queuePhotoFile(tx, old, clock());
      return old;
    });
  }

  async function forget(key: string | null) {
    if (key === null || photos === undefined) return;
    await deletePhotoFileNow({ db, photos, logger, key });
  }

  return {
    async put(userId, file) {
      const checked = checkProfilePhoto(file);
      if (!checked.ok) return err({ code: "photo_invalid", issue: checked.error });
      if (photos === undefined) return err({ code: "photo_storage_off" });
      const key = newKey();
      // Queued first, so a crash after the upload leaves a file the job deletes, never one nobody knows.
      await queuePhotoFile(db, key, new Date(clock().getTime() + unsavedUploadGraceMs));
      try {
        await photos.put(key, file);
      } catch (error) {
        logger.warn({ err: error }, "profile photo not stored");
        return err({ code: "photo_storage_unavailable" });
      }
      await forget(await swap(userId, key));
      return ok(undefined);
    },

    async remove(userId) {
      await forget(await swap(userId, null));
    },
  };
}
