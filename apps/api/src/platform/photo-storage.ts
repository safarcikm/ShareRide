// Photo storage (ADRs 0022 and 0037): Hetzner Object Storage in Nuremberg
// (photo-storage-hetzner.ts), or a folder on this computer in development
// and tests. The API keeps each photo's key; the storage keeps its file
// and gives links to show it: meeting point photos (spec 2, 3.6.3) and
// profile photos (spec 1, 3.5; ADR 0033).
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Where a photo's file is kept: its folder, a random name, never the file's own name. */
export const photoKeyPattern = /^(meeting-points|profile-photos)\/[0-9a-f-]{36}\.jpg$/;

export const newMeetingPointPhotoKey = () => `meeting-points/${randomUUID()}.jpg`;

/** A new name for each profile photo, so a link to the last one never shows the next. */
export const newProfilePhotoKey = () => `profile-photos/${randomUUID()}.jpg`;

/** How long a link to a photo lasts at the least, so a cached answer still shows it. */
export const photoLinkLifetimeMs = 3600_000;

export interface PhotoStorage {
  /** Stores a JPEG under its key; throws if it was not stored. */
  put(key: string, file: Uint8Array<ArrayBuffer>): Promise<void>;
  /** Deletes a photo's file; a key with no file is fine. Throws if it may still be there. */
  remove(key: string): Promise<void>;
  /** The file under a key, or undefined when there is none; throws if it cannot tell. */
  read(key: string): Promise<Uint8Array<ArrayBuffer> | undefined>;
  /**
   * A link to show the photo, valid at least `photoLinkLifetimeMs` from
   * `now` and the same all through the hour, so the apps can cache it.
   * Absolute, or a path on the API's own origin.
   */
  linkTo(key: string, now: Date): Promise<string>;
  /**
   * The origin the links lead to, for the content security policy of the
   * console and the web app; null when they are on the API's own origin.
   */
  readonly origin: string | null;
}

/** The path the API serves a photo of the folder storage at. */
export const photoFilesPath = "/v1/photo-files";

/** Photos in a folder, whose files the API serves itself at `photoFilesPath`. */
export type FolderPhotoStorage = PhotoStorage;

/**
 * Photos in a folder on this computer, for development and tests; the
 * configuration refuses it under NODE_ENV=production, where a deploy
 * would lose them. Its links are paths on the API itself.
 */
export function createFolderPhotoStorage(folder: string): FolderPhotoStorage {
  const fileOf = (key: string) => {
    if (!photoKeyPattern.test(key)) throw new Error("Not a photo key.");
    return join(folder, key);
  };
  return {
    origin: null,
    async put(key, file) {
      const path = fileOf(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file);
    },
    async remove(key) {
      await rm(fileOf(key), { force: true });
    },
    linkTo(key) {
      fileOf(key);
      return Promise.resolve(`${photoFilesPath}/${key}`);
    },
    async read(key) {
      if (!photoKeyPattern.test(key)) return undefined;
      try {
        return new Uint8Array(await readFile(fileOf(key)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    },
  };
}

export interface FakePhotoStorage extends PhotoStorage {
  /** The files stored, by key. */
  readonly files: Map<string, Uint8Array<ArrayBuffer>>;
  /** While set, `put` throws it instead. */
  failure: Error | null;
  /** While set, `remove` throws it instead. */
  removeFailure: Error | null;
}

/** For tests: keeps the files in memory, with links that name the key. */
export function createFakePhotoStorage(): FakePhotoStorage {
  const fake: FakePhotoStorage = {
    files: new Map(),
    failure: null,
    removeFailure: null,
    origin: "https://photos.test",
    put(key, file) {
      if (fake.failure !== null) return Promise.reject(fake.failure);
      fake.files.set(key, file);
      return Promise.resolve();
    },
    remove(key) {
      if (fake.removeFailure !== null) return Promise.reject(fake.removeFailure);
      fake.files.delete(key);
      return Promise.resolve();
    },
    read(key) {
      return Promise.resolve(fake.files.get(key));
    },
    linkTo(key) {
      return Promise.resolve(`https://photos.test/${key}`);
    },
  };
  return fake;
}
