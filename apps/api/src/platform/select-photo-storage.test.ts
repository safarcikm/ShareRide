import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { selectPhotoStorage } from "./select-photo-storage.ts";

describe("selectPhotoStorage (ADR 0022)", () => {
  it("keeps no photos with no storage", () => {
    expect(selectPhotoStorage({ provider: "none" })).toEqual({});
  });

  it("keeps them in a folder the API serves itself, in development", async () => {
    const folder = mkdtempSync(join(tmpdir(), "shareride-photos-"));
    const { photos, photoFiles } = selectPhotoStorage({ provider: "folder", folder });
    expect(photos).toBe(photoFiles);
    expect(photos?.origin).toBeNull();
    const key = "meeting-points/0190a1d6-0000-7000-8000-000000000001.jpg";
    await photos?.put(key, Uint8Array.from([1, 2, 3]));
    expect(await photoFiles?.read(key)).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it("keeps them in the Hetzner bucket, whose links lead to its own origin", () => {
    const { photos, photoFiles } = selectPhotoStorage({
      provider: "hetzner",
      endpoint: "https://hel1.your-objectstorage.com",
      bucket: "shareride-photos",
      accessKey: "access",
      secretKey: "secret",
    });
    expect(photos?.origin).toBe("https://shareride-photos.hel1.your-objectstorage.com");
    expect(photoFiles).toBeUndefined();
  });
});
