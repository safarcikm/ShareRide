// Checks the Hetzner adapter against the real bucket: a photo is stored,
// shown through its signed link and not without it, and deleted. `pnpm
// --filter @shareride/api test:contract` with PHOTO_BUCKET_ENDPOINT,
// PHOTO_BUCKET, PHOTO_BUCKET_ACCESS_KEY and PHOTO_BUCKET_SECRET_KEY set.
// Not part of the CI run. It leaves nothing in the bucket.
import { describe, expect, it } from "vitest";
import { createHetznerPhotoStorage } from "./photo-storage-hetzner.ts";
import { newMeetingPointPhotoKey } from "./photo-storage.ts";

const endpoint = process.env["PHOTO_BUCKET_ENDPOINT"];
const bucket = process.env["PHOTO_BUCKET"];
const accessKey = process.env["PHOTO_BUCKET_ACCESS_KEY"];
const secretKey = process.env["PHOTO_BUCKET_SECRET_KEY"];

/** Not a picture anyone sees: the bucket stores bytes as they come. */
const file = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

describe.skipIf(
  endpoint === undefined ||
    bucket === undefined ||
    accessKey === undefined ||
    secretKey === undefined,
)("Hetzner Object Storage contract", () => {
  it("stores a photo, shows it only through a signed link, and deletes it", async () => {
    if (
      endpoint === undefined ||
      bucket === undefined ||
      accessKey === undefined ||
      secretKey === undefined
    ) {
      return;
    }
    const storage = createHetznerPhotoStorage({ endpoint, bucket, accessKey, secretKey });
    const key = newMeetingPointPhotoKey();
    await storage.put(key, file);
    try {
      const link = await storage.linkTo(key, new Date());
      const shown = await fetch(link);
      expect(shown.status).toBe(200);
      expect(shown.headers.get("content-type")).toBe("image/jpeg");
      expect(new Uint8Array(await shown.arrayBuffer())).toEqual(file);

      const unsigned = await fetch(`${storage.origin ?? ""}/${key}`);
      expect(unsigned.status).toBe(403);
    } finally {
      await storage.remove(key);
    }
    const gone = await fetch(await storage.linkTo(key, new Date()));
    expect(gone.status).toBe(404);
  });

  it("refuses a wrong secret", async () => {
    if (endpoint === undefined || bucket === undefined || accessKey === undefined) return;
    const storage = createHetznerPhotoStorage({
      endpoint,
      bucket,
      accessKey,
      secretKey: "wrong-secret-for-the-contract-test",
    });
    await expect(storage.put(newMeetingPointPhotoKey(), file)).rejects.toThrow(
      "Photo storage answered 403 to PUT.",
    );
  });
});
