import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFakePhotoStorage,
  createFolderPhotoStorage,
  newMeetingPointPhotoKey,
  newProfilePhotoKey,
  photoKeyPattern,
} from "./photo-storage.ts";

describe("photo keys", () => {
  it("are random names in the meeting points folder", () => {
    const key = newMeetingPointPhotoKey();
    expect(key).toMatch(photoKeyPattern);
    expect(newMeetingPointPhotoKey()).not.toBe(key);
  });

  it("are random names in the profile photos folder for people's photos (ADR 0033)", () => {
    const key = newProfilePhotoKey();
    expect(key).toMatch(/^profile-photos\/[0-9a-f-]{36}\.jpg$/);
    expect(key).toMatch(photoKeyPattern);
    expect(newProfilePhotoKey()).not.toBe(key);
  });

  it("never lead out of their folder", () => {
    for (const key of [
      "profile-photos/../meeting-points/0193f0c4-7d4a-7b1e-9c2a-123456789abc.jpg",
      "other/0193f0c4-7d4a-7b1e-9c2a-123456789abc.jpg",
      "meeting-points/../../etc/passwd",
      "../meeting-points/0193f0c4-7d4a-7b1e-9c2a-123456789abc.jpg",
      "meeting-points/0193f0c4-7d4a-7b1e-9c2a-123456789abc.jpg/..",
      "/meeting-points/0193f0c4-7d4a-7b1e-9c2a-123456789abc.jpg",
    ]) {
      expect(key).not.toMatch(photoKeyPattern);
    }
  });
});

describe("createFolderPhotoStorage", () => {
  let folder: string;
  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "shareride-photos-"));
  });
  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it("keeps a file under its key, links to it on the API, and deletes it", async () => {
    const storage = createFolderPhotoStorage(folder);
    const key = newMeetingPointPhotoKey();
    const file = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    await storage.put(key, file);
    expect(await storage.read(key)).toEqual(file);
    expect(await storage.linkTo(key, new Date())).toBe(`/v1/photo-files/${key}`);
    expect(storage.origin).toBeNull();
    await storage.remove(key);
    expect(await storage.read(key)).toBeUndefined();
    await expect(storage.remove(key)).resolves.toBeUndefined();
  });

  it("keeps a profile photo too", async () => {
    const storage = createFolderPhotoStorage(folder);
    const key = newProfilePhotoKey();
    const file = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    await storage.put(key, file);
    expect(await storage.read(key)).toEqual(file);
  });

  it("reads nothing outside the folder, and refuses to write there", async () => {
    const storage = createFolderPhotoStorage(folder);
    expect(await storage.read("meeting-points/../../secret")).toBeUndefined();
    await expect(storage.put("../outside.jpg", new Uint8Array([1]))).rejects.toThrow(
      "Not a photo key.",
    );
  });
});

describe("createFakePhotoStorage", () => {
  it("reads back what it keeps, and nothing once deleted", async () => {
    const storage = createFakePhotoStorage();
    const key = newProfilePhotoKey();
    const file = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    await storage.put(key, file);
    expect(await storage.read(key)).toEqual(file);
    await storage.remove(key);
    expect(await storage.read(key)).toBeUndefined();
  });
});
