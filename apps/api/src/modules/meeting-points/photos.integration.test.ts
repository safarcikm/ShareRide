import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AdminMeetingPointPhoto,
  ErrorResponse,
  MeetingPointDetails,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId, seedSampleMeetingPoints } from "@shareride/db/seed";
import { photoLimits } from "@shareride/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.ts";
import { createLogger } from "../../logger.ts";
import { createFolderPhotoStorage } from "../../platform/photo-storage.ts";
import { startTestApi, type TestApi } from "../../testing.ts";

let api: TestApi;
let cookie: string;

beforeAll(async () => {
  api = await startTestApi();
  await seedSampleMeetingPoints(api.connection.db, api.now());
  ({ cookie } = await api.signInOperator());
});

afterAll(async () => {
  await api.close();
});

const fitjar = sampleId("point:fitjar");
const borgarnes = sampleId("point:borgarnes");
const { meetingPointPhotos, meetingPoints } = schema;

beforeEach(async () => {
  await api.connection.db.delete(meetingPointPhotos);
  api.photos.files.clear();
  api.photos.failure = null;
});

const segment = (marker: number, data: readonly number[]) => [
  0xff,
  marker,
  (data.length + 2) >> 8,
  (data.length + 2) & 0xff,
  ...data,
];

const ascii = (text: string) => Array.from(text, (letter) => letter.charCodeAt(0));

/** A JPEG as the console's canvas writes it, or with a segment added before its picture. */
function jpeg(options: { width?: number; height?: number; extra?: number[] } = {}) {
  const { width = 1200, height = 900 } = options;
  return Uint8Array.from([
    0xff,
    0xd8,
    ...segment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...(options.extra ?? []),
    ...segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]),
    ...segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]),
    ...segment(0xc4, [0, 1, ...Array.from({ length: 15 }, () => 0), 0]),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    0x12,
    0x34,
    0xff,
    0xd9,
  ]);
}

/** A JPEG of exactly `bytes` bytes, its picture data filling the rest. */
function jpegOfSize(bytes: number) {
  const small = jpeg();
  const file = new Uint8Array(bytes).fill(0x12);
  // Everything before the small one's picture data, then its end marker.
  file.set(small.subarray(0, small.length - 4));
  file.set([0xff, 0xd9], bytes - 2);
  return file;
}

const base64 = (file: Uint8Array) => Buffer.from(file).toString("base64");

const shelter = {
  descriptionIs: "Skýlið við inngang N1.",
  descriptionEn: "The shelter by N1's entrance.",
};

async function send(method: string, path: string, body?: unknown, withCookie = cookie) {
  const response = await api.request(path, {
    method,
    headers: { cookie: withCookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

const photosPath = (point: string) => `/admin/v1/meeting-points/${point}/photos`;

const errorOf = (body: unknown) => (body as ErrorResponse).error;
const photosOf = (body: unknown) => (body as { photos: AdminMeetingPointPhoto[] }).photos;

async function add(point = fitjar, input: Record<string, unknown> = {}) {
  return send("POST", photosPath(point), { ...shelter, file: base64(jpeg()), ...input });
}

async function added(point = fitjar, input: Record<string, unknown> = {}) {
  const { status, body } = await add(point, input);
  if (status !== 201) throw new Error(`Not added: ${JSON.stringify(body)}`);
  return photosOf(body);
}

async function auditEntriesFor(subjectId: string, prefix: string) {
  const { rows } = await api.connection.pool.query<{
    action: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  }>(
    "SELECT action, before, after FROM audit_log WHERE subject_id = $1 AND action LIKE $2 ORDER BY created_at, id",
    [subjectId, `${prefix}%`],
  );
  return rows;
}

/** Does `act` while the audit log refuses every entry. */
async function whileAuditRefuses(act: () => Promise<void>) {
  const { pool } = api.connection;
  await pool.query(`
    CREATE FUNCTION test_refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'test: audit entry refused';
    END $$;
    CREATE TRIGGER test_refuse_audit BEFORE INSERT ON audit_log
      FOR EACH ROW EXECUTE FUNCTION test_refuse_audit();
  `);
  try {
    await act();
  } finally {
    await pool.query(`
      DROP TRIGGER test_refuse_audit ON audit_log;
      DROP FUNCTION test_refuse_audit();
    `);
  }
}

describe("a meeting point's photos in the console (spec 2, 3.6.3)", () => {
  it("need a console session for every route", async () => {
    const noSession = "sr_operator=sr_os_not-a-session";
    const photo = randomUUID();
    for (const [method, path, body] of [
      ["GET", photosPath(fitjar), undefined],
      ["POST", photosPath(fitjar), { ...shelter, file: base64(jpeg()) }],
      ["PUT", `${photosPath(fitjar)}/${photo}`, { ...shelter, updatedAt: api.now() }],
      ["PUT", `/admin/v1/meeting-points/${fitjar}/photo-order`, { order: [photo] }],
      ["DELETE", `${photosPath(fitjar)}/${photo}`, undefined],
    ] as const) {
      const { status, body: reply } = await send(method, path, body, noSession);
      expect(status).toBe(401);
      expect(errorOf(reply).code).toBe("operator_unauthenticated");
    }
    expect(api.photos.files.size).toBe(0);
  });

  it("adds a photo under a random name, with its descriptions, size and a link", async () => {
    const file = jpeg({ width: 1600, height: 1200 });
    const { status, body } = await add(fitjar, {
      file: base64(file),
      descriptionIs: "  Skýlið við inngang N1. ",
      descriptionEn: "The shelter by N1's entrance.\n",
    });
    expect(status).toBe(201);
    const [photo] = photosOf(body);
    const [key, stored] = [...api.photos.files][0] ?? [];
    expect(key).toMatch(/^meeting-points\/[0-9a-f-]{36}\.jpg$/);
    expect(stored).toEqual(file);
    expect(photo).toEqual({
      id: expect.any(String) as unknown,
      url: `https://photos.test/${key ?? ""}`,
      ...shelter,
      width: 1600,
      height: 1200,
      updatedAt: expect.any(String) as unknown,
    });
    const listed = await send("GET", photosPath(fitjar));
    expect(listed).toEqual({ status: 200, body: { photos: [photo] } });
  });

  it("writes an audit entry of the photo and its descriptions, never the file", async () => {
    const [photo] = await added();
    const entries = await auditEntriesFor(fitjar, "meeting_point.photo");
    // The log keeps the entries of earlier tests: it refuses deletes.
    expect(entries.filter((entry) => entry.after?.["photoId"] === photo?.id)).toEqual([
      {
        action: "meeting_point.photo_added",
        before: null,
        after: { photoId: photo?.id, ...shelter, width: 1200, height: 900 },
      },
    ]);
  });

  it("refuses a file that is not a JPEG, carries metadata or is too large, and stores nothing", async () => {
    const exif = segment(0xe1, [...ascii("Exif"), 0, 0, 0x4d, 0x4d]);
    for (const [file, issue] of [
      [Uint8Array.from(ascii("\u0089PNG\r\n")), "not_jpeg"],
      [jpeg({ extra: exif }), "metadata"],
      [jpeg({ width: 2000, height: 1500 }), "too_large"],
    ] as const) {
      const { status, body } = await add(fitjar, { file: base64(file) });
      expect(status).toBe(400);
      expect(errorOf(body)).toMatchObject({
        code: "validation_failed",
        details: [{ path: "file", issue }],
      });
    }
    expect(api.photos.files.size).toBe(0);
    expect(await api.connection.db.$count(meetingPointPhotos)).toBe(0);
  });

  it("needs a description in each language, and names each problem", async () => {
    const { status, body } = await add(fitjar, { descriptionIs: " ", descriptionEn: "" });
    expect(status).toBe(400);
    expect(errorOf(body).details).toEqual([
      { path: "descriptionIs", issue: "required" },
      { path: "descriptionEn", issue: "required" },
    ]);
    expect(api.photos.files.size).toBe(0);
  });

  it("keeps at most five photos, and stores no sixth", async () => {
    for (let count = 0; count < 5; count += 1) await added();
    const { status, body } = await add();
    expect(status).toBe(409);
    expect(errorOf(body).code).toBe("too_many_photos");
    expect(api.photos.files.size).toBe(5);
  });

  it("leaves a retired point's photos as they are", async () => {
    await api.connection.db
      .update(meetingPoints)
      .set({ status: "retired" })
      .where(eq(meetingPoints.id, borgarnes));
    try {
      const { status, body } = await add(borgarnes);
      expect(status).toBe(409);
      expect(errorOf(body).code).toBe("meeting_point_retired");
    } finally {
      await api.connection.db
        .update(meetingPoints)
        .set({ status: "active" })
        .where(eq(meetingPoints.id, borgarnes));
    }
    expect(api.photos.files.size).toBe(0);
  });

  it("answers 404 for a point that does not exist", async () => {
    expect((await add(randomUUID())).status).toBe(404);
    expect((await send("GET", photosPath(randomUUID()))).status).toBe(404);
    expect(api.photos.files.size).toBe(0);
  });

  it("saves no photo when the storage fails", async () => {
    api.photos.failure = new Error("test: storage down");
    const { status, body } = await add();
    expect(status).toBe(503);
    expect(errorOf(body).code).toBe("photo_storage_unavailable");
    expect(api.photos.files.size).toBe(0);
    expect(await api.connection.db.$count(meetingPointPhotos)).toBe(0);
  });

  it("keeps a saved photo's file when its links fail afterwards", async () => {
    const linkTo = api.photos.linkTo.bind(api.photos);
    api.photos.linkTo = () => Promise.reject(new Error("test: cannot sign"));
    try {
      expect((await add()).status).toBe(500);
    } finally {
      api.photos.linkTo = linkTo;
    }
    expect(await api.connection.db.$count(meetingPointPhotos)).toBe(1);
    expect(api.photos.files.size).toBe(1);
  });

  it("saves a photo with its audit entry or not at all, and then deletes its file", async () => {
    await whileAuditRefuses(async () => {
      expect((await add()).status).toBe(500);
    });
    expect(await api.connection.db.$count(meetingPointPhotos)).toBe(0);
    expect(api.photos.files.size).toBe(0);
  });

  it("takes a file of the largest size, 2 MB, within the body's limit", async () => {
    const largest = await add(fitjar, { file: base64(jpegOfSize(photoLimits.maxBytes)) });
    expect(largest.status).toBe(201);
    const over = await add(fitjar, { file: base64(jpegOfSize(photoLimits.maxBytes + 1)) });
    expect(over.status).toBe(400);
    expect(errorOf(over.body).details).toEqual([
      { path: "file", issue: expect.any(String) as unknown },
    ]);
  });

  it("refuses a body over the limit before reading it", async () => {
    const response = await api.request(photosPath(fitjar), {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ ...shelter, file: "A".repeat(3_500_000) }),
    });
    expect(response.status).toBe(413);
    expect(errorOf(await response.json()).code).toBe("payload_too_large");
  });

  describe("descriptions", () => {
    it("changes them, with an audit entry of what changed", async () => {
      const [photo] = await added();
      api.advance(60);
      const { status, body } = await send("PUT", `${photosPath(fitjar)}/${photo?.id ?? ""}`, {
        descriptionIs: shelter.descriptionIs,
        descriptionEn: "The glass shelter by the entrance.",
        updatedAt: photo?.updatedAt,
      });
      expect(status).toBe(200);
      const [changed] = photosOf(body);
      expect(changed).toMatchObject({
        id: photo?.id,
        descriptionEn: "The glass shelter by the entrance.",
      });
      expect(changed?.updatedAt).not.toBe(photo?.updatedAt);
      expect((await auditEntriesFor(fitjar, "meeting_point.photo_described"))[0]).toEqual({
        action: "meeting_point.photo_described",
        before: { photoId: photo?.id, descriptionEn: shelter.descriptionEn },
        after: { photoId: photo?.id, descriptionEn: "The glass shelter by the entrance." },
      });
    });

    it("refuses a copy older than the photo's", async () => {
      const [photo] = await added();
      const path = `${photosPath(fitjar)}/${photo?.id ?? ""}`;
      const first = { ...shelter, descriptionEn: "First", updatedAt: photo?.updatedAt };
      expect((await send("PUT", path, first)).status).toBe(200);
      const { status, body } = await send("PUT", path, { ...first, descriptionEn: "Second" });
      expect(status).toBe(409);
      expect(errorOf(body).code).toBe("photo_changed");
    });

    it("checks them as it does a new photo's", async () => {
      const [photo] = await added();
      const { status, body } = await send("PUT", `${photosPath(fitjar)}/${photo?.id ?? ""}`, {
        descriptionIs: "x".repeat(251),
        descriptionEn: shelter.descriptionEn,
        updatedAt: photo?.updatedAt,
      });
      expect(status).toBe(400);
      expect(errorOf(body).details).toEqual([{ path: "descriptionIs", issue: "too_long" }]);
    });

    it("answers 404 for a photo of another point", async () => {
      const [photo] = await added(borgarnes);
      const { status } = await send("PUT", `${photosPath(fitjar)}/${photo?.id ?? ""}`, {
        ...shelter,
        updatedAt: photo?.updatedAt,
      });
      expect(status).toBe(404);
    });
  });

  describe("order", () => {
    it("puts the photos in a new order, with an audit entry", async () => {
      await added(fitjar, { descriptionEn: "One" });
      await added(fitjar, { descriptionEn: "Two" });
      const photos = await added(fitjar, { descriptionEn: "Three" });
      const ids = photos.map((photo) => photo.id);
      const order = [ids[2], ids[0], ids[1]];
      const { status, body } = await send("PUT", `/admin/v1/meeting-points/${fitjar}/photo-order`, {
        order,
      });
      expect(status).toBe(200);
      expect(photosOf(body).map((photo) => photo.descriptionEn)).toEqual(["Three", "One", "Two"]);
      expect((await send("GET", photosPath(fitjar))).body).toEqual(body);
      expect(await auditEntriesFor(fitjar, "meeting_point.photos_ordered")).toEqual([
        {
          action: "meeting_point.photos_ordered",
          before: { order: ids },
          after: { order },
        },
      ]);
    });

    it("refuses an order that misses a photo added or removed since", async () => {
      await added();
      const photos = await added();
      const { status, body } = await send("PUT", `/admin/v1/meeting-points/${fitjar}/photo-order`, {
        order: [photos[0]?.id],
      });
      expect(status).toBe(409);
      expect(errorOf(body).code).toBe("photos_changed");
    });
  });

  describe("removing", () => {
    it("deletes the photo and its file, and closes up the order", async () => {
      await added(fitjar, { descriptionEn: "One" });
      await added(fitjar, { descriptionEn: "Two" });
      const photos = await added(fitjar, { descriptionEn: "Three" });
      const removed = photos[1];
      const { status, body } = await send("DELETE", `${photosPath(fitjar)}/${removed?.id ?? ""}`);
      expect(status).toBe(200);
      expect(photosOf(body).map((photo) => photo.descriptionEn)).toEqual(["One", "Three"]);
      expect(api.photos.files.size).toBe(2);
      const positions = await api.connection.db
        .select({ position: meetingPointPhotos.position })
        .from(meetingPointPhotos)
        .orderBy(meetingPointPhotos.position);
      expect(positions).toEqual([{ position: 0 }, { position: 1 }]);
      expect(await auditEntriesFor(fitjar, "meeting_point.photo_removed")).toEqual([
        {
          action: "meeting_point.photo_removed",
          before: {
            photoId: removed?.id,
            ...shelter,
            descriptionEn: "Two",
            width: 1200,
            height: 900,
          },
          after: null,
        },
      ]);
    });

    it("answers 404 for a photo already removed", async () => {
      const [photo] = await added();
      const path = `${photosPath(fitjar)}/${photo?.id ?? ""}`;
      expect((await send("DELETE", path)).status).toBe(200);
      expect((await send("DELETE", path)).status).toBe(404);
    });

    it("keeps the photo while its audit entry is refused", async () => {
      const [photo] = await added();
      await whileAuditRefuses(async () => {
        expect((await send("DELETE", `${photosPath(fitjar)}/${photo?.id ?? ""}`)).status).toBe(500);
      });
      expect(await api.connection.db.$count(meetingPointPhotos)).toBe(1);
      expect(api.photos.files.size).toBe(1);
    });
  });
});

describe("a meeting point's photos in the app (spec 2, 3.2)", () => {
  it("come with its details, in order, with both descriptions", async () => {
    await added(fitjar, { descriptionIs: "Eitt", descriptionEn: "One" });
    const photos = await added(fitjar, { descriptionIs: "Tvö", descriptionEn: "Two" });
    const response = await api.request(`/v1/meeting-points/${fitjar}`);
    const details = (await response.json()) as MeetingPointDetails;
    expect(details.photos).toEqual(
      photos.map((photo) => ({
        url: photo.url,
        description: { is: photo.descriptionIs, en: photo.descriptionEn },
        width: 1200,
        height: 900,
      })),
    );
  });

  it("are none for a point without photos", async () => {
    const response = await api.request(`/v1/meeting-points/${borgarnes}`);
    expect(((await response.json()) as MeetingPointDetails).photos).toEqual([]);
  });
});

describe("photos in a folder, in development (ADR 0022)", () => {
  function folderApp() {
    const folder = createFolderPhotoStorage(mkdtempSync(join(tmpdir(), "shareride-photos-")));
    const app = createApp({
      logger: createLogger({ level: "silent" }),
      checkDatabase: () => Promise.resolve(),
      features: { ...api.features, photos: folder, photoFiles: folder },
    });
    const request = (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set("cookie", cookie);
      headers.set("content-type", "application/json");
      return app.request(path, { ...init, headers });
    };
    return { folder, request };
  }

  it("are served by the API itself, as JPEGs, at their links", async () => {
    const { request } = folderApp();
    const response = await request(photosPath(fitjar), {
      method: "POST",
      body: JSON.stringify({ ...shelter, file: base64(jpeg()) }),
    });
    expect(response.status).toBe(201);
    const [photo] = photosOf(await response.json());
    expect(photo?.url).toMatch(/^\/v1\/photo-files\/meeting-points\/[0-9a-f-]{36}\.jpg$/);

    const file = await request(photo?.url ?? "");
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(jpeg());
  });

  it("answers 404 for a missing photo or a path that is not a photo's", async () => {
    const { request } = folderApp();
    for (const path of [
      `/v1/photo-files/meeting-points/${randomUUID()}.jpg`,
      "/v1/photo-files/meeting-points/../../secret.jpg",
      "/v1/photo-files/meeting-points/%2e%2e%2fsecret.jpg",
      "/v1/photo-files/other/file.jpg",
    ]) {
      expect((await request(path)).status, path).toBe(404);
    }
  });
});
