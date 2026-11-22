import { deleteMyPhotoRoute, getMeRoute, putMyPhotoRoute } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { profilePhotoLimits } from "@shareride/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.ts";
import { createLogger } from "../../logger.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import { deleteDuePhotoFiles, queuePhotoFile } from "./photo-files.ts";

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.close();
});

const { photoFilesToDelete, users } = schema;

beforeEach(async () => {
  await api.connection.db.delete(photoFilesToDelete);
  api.photos.files.clear();
  api.photos.failure = null;
  api.photos.removeFailure = null;
});

const segment = (marker: number, data: readonly number[]) => [
  0xff,
  marker,
  (data.length + 2) >> 8,
  (data.length + 2) & 0xff,
  ...data,
];

const ascii = (text: string) => Array.from(text, (letter) => letter.charCodeAt(0));

/** A JPEG as the app writes it, or with a segment added before its picture. */
function jpeg(options: { width?: number; height?: number; extra?: number[]; fill?: number } = {}) {
  const { width = 640, height = 640, fill = 0x12 } = options;
  return Uint8Array.from([
    0xff,
    0xd8,
    ...segment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...(options.extra ?? []),
    ...segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]),
    ...segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]),
    ...segment(0xc4, [0, 1, ...Array.from({ length: 15 }, () => 0), 0]),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    fill,
    0x34,
    0xff,
    0xd9,
  ]);
}

const base64 = (file: Uint8Array) => Buffer.from(file).toString("base64");

async function newPerson() {
  return api.signIn(api.newPhoneNumber());
}

function put(accessToken: string, file: Uint8Array) {
  return api.client.call(putMyPhotoRoute, { body: { photo: base64(file) }, accessToken });
}

async function photoKeyOf(userId: string) {
  const [row] = await api.connection.db
    .select({ photoKey: users.photoKey })
    .from(users)
    .where(eq(users.id, userId));
  return row?.photoKey ?? null;
}

async function queuedKeys() {
  const rows = await api.connection.db.select().from(photoFilesToDelete);
  return rows.map((row) => row.key);
}

describe("adding a profile photo (spec 1, 3.5; ADR 0033)", () => {
  it("stores the file under a new random key and shows it in my account", async () => {
    const { accessToken, userId } = await newPerson();
    const file = jpeg();
    const result = await put(accessToken, file);
    if (!result.ok) throw new Error(result.error.code);
    const key = await photoKeyOf(userId);
    expect(key).toMatch(/^profile-photos\/[0-9a-f-]{36}\.jpg$/);
    expect(result.data.photo).toEqual({ url: `https://photos.test/${key ?? ""}`, hidden: false });
    expect(api.photos.files.get(key ?? "")).toEqual(file);
    // Saved: the upload's own row in the queue is gone.
    expect(await queuedKeys()).toEqual([]);

    const me = await api.client.call(getMeRoute, { accessToken });
    expect(me.ok && me.data.photo).toEqual(result.data.photo);
  });

  it("refuses a file that is not a clean square JPEG, and stores nothing", async () => {
    const { accessToken, userId } = await newPerson();
    const exif = segment(0xe1, [...ascii("Exif"), 0, 0, ...ascii("GPS 64.1 -21.9")]);
    for (const [file, issue] of [
      [jpeg({ width: 640, height: 480 }), "not_square"],
      [jpeg({ extra: exif }), "metadata"],
      [jpeg({ width: 200, height: 200 }), "too_small"],
      [jpeg({ width: 800, height: 800 }), "too_large"],
      [Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), "not_jpeg"],
    ] as const) {
      const result = await put(accessToken, file);
      expect(result.ok ? null : result.error).toMatchObject({
        code: "validation_failed",
        details: [{ path: "photo", issue }],
      });
    }
    expect(api.photos.files.size).toBe(0);
    expect(await photoKeyOf(userId)).toBeNull();
  });

  it("refuses a body over the limit before reading it", async () => {
    const { accessToken } = await newPerson();
    const response = await api.request("/v1/me/photo", {
      method: "PUT",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ photo: "A".repeat(2 * profilePhotoLimits.maxBytes) }),
    });
    expect(response.status).toBe(413);
  });

  it("deletes the last photo's file when it is replaced", async () => {
    const { accessToken, userId } = await newPerson();
    await put(accessToken, jpeg({ fill: 0x11 }));
    const first = await photoKeyOf(userId);
    const second = await put(accessToken, jpeg({ fill: 0x22 }));
    expect(second.ok).toBe(true);
    const key = await photoKeyOf(userId);
    expect(key).not.toBe(first);
    expect([...api.photos.files.keys()]).toEqual([key]);
    expect(await queuedKeys()).toEqual([]);
  });

  it("answers 503 when storage does not take the file, and keeps the last photo", async () => {
    const { accessToken, userId } = await newPerson();
    await put(accessToken, jpeg());
    const kept = await photoKeyOf(userId);
    api.photos.failure = new Error("bucket down");
    const result = await put(accessToken, jpeg({ fill: 0x22 }));
    expect(result.ok ? null : result.error.code).toBe("photo_storage_unavailable");
    expect(await photoKeyOf(userId)).toBe(kept);
  });

  it("answers 503 photo_storage_off on a server without photo storage", async () => {
    const { db, sms, hasher, exportCipher, clock, clientAddress, secureCookies } = api.features;
    const app = createApp({
      logger: createLogger({ level: "silent" }),
      checkDatabase: () => Promise.resolve(),
      features: { db, sms, hasher, exportCipher, clock, clientAddress, secureCookies },
    });
    const { accessToken } = await newPerson();
    const response = await app.request("/v1/me/photo", {
      method: "PUT",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ photo: base64(jpeg()) }),
    });
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "photo_storage_off",
    );
  });
});

describe("removing a profile photo", () => {
  it("deletes its file, and removing none is fine", async () => {
    const { accessToken, userId } = await newPerson();
    await put(accessToken, jpeg());
    const removed = await api.client.call(deleteMyPhotoRoute, { accessToken });
    expect(removed.ok && removed.data.photo).toBeNull();
    expect(await photoKeyOf(userId)).toBeNull();
    expect(api.photos.files.size).toBe(0);
    expect(await queuedKeys()).toEqual([]);

    const again = await api.client.call(deleteMyPhotoRoute, { accessToken });
    expect(again.ok).toBe(true);
  });

  it("keeps a file whose deletion failed in the queue, for the job to delete", async () => {
    const { accessToken } = await newPerson();
    await put(accessToken, jpeg());
    api.photos.removeFailure = new Error("bucket down");
    await api.client.call(deleteMyPhotoRoute, { accessToken });
    const [queued] = await queuedKeys();
    expect(queued).toMatch(/^profile-photos\//);
    expect(api.photos.files.has(queued ?? "")).toBe(true);

    api.photos.removeFailure = null;
    const deleted = await deleteDuePhotoFiles({
      db: api.connection.db,
      photos: api.photos,
      now: api.now(),
      logger: createLogger({ level: "silent" }),
    });
    expect(deleted).toBe(1);
    expect(api.photos.files.size).toBe(0);
    expect(await queuedKeys()).toEqual([]);
  });
});

describe("the photo files job", () => {
  const job = () =>
    deleteDuePhotoFiles({
      db: api.connection.db,
      photos: api.photos,
      now: api.now(),
      logger: createLogger({ level: "silent" }),
    });

  it("deletes a file only once its time has come", async () => {
    const key = "profile-photos/0193f0c4-7d4a-7b1e-9c2a-123456789abc.jpg";
    api.photos.files.set(key, jpeg());
    await queuePhotoFile(api.connection.db, key, new Date(api.now().getTime() + 15 * 60_000));
    expect(await job()).toBe(0);
    expect(api.photos.files.has(key)).toBe(true);

    api.advance(15 * 60);
    expect(await job()).toBe(1);
    expect(api.photos.files.has(key)).toBe(false);
    expect(await queuedKeys()).toEqual([]);
  });

  it("keeps a row whose file could not be deleted, and tries again two minutes later", async () => {
    const key = "profile-photos/0193f0c4-7d4a-7b1e-9c2a-123456789abd.jpg";
    api.photos.files.set(key, jpeg());
    await queuePhotoFile(api.connection.db, key, api.now());
    api.photos.removeFailure = new Error("bucket down");
    expect(await job()).toBe(0);
    expect(await queuedKeys()).toEqual([key]);

    api.photos.removeFailure = null;
    // Taken by the run that failed, so the next minute's run leaves it.
    api.advance(60);
    expect(await job()).toBe(0);
    api.advance(60);
    expect(await job()).toBe(1);
    expect(api.photos.files.has(key)).toBe(false);
    expect(await queuedKeys()).toEqual([]);
  });
});
