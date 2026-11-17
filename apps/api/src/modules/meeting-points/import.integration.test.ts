import type { AdminImportRow, AdminMeetingPoint, ErrorResponse } from "@shareride/contracts";
import { seedSampleMeetingPoints } from "@shareride/db/seed";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";

let api: TestApi;
let cookie: string;
let operatorId: string;

beforeAll(async () => {
  api = await startTestApi();
  await seedSampleMeetingPoints(api.connection.db, api.now());
  const signedIn = await api.signInOperator();
  cookie = signedIn.cookie;
  operatorId = signedIn.userId;
});

afterAll(async () => {
  await api.close();
});

const header =
  "name_is,name_en,aliases,latitude,longitude,type,region,municipality,where_to_stand_is,where_to_stand_en,amenities,season_start,season_end";

/** Made-up points along Route 1, one row each. */
const row = (nameIs: string, rest = "64.5383,-21.9206,fuel-station,west,Borgarbyggð,,,shop,,") =>
  `${nameIs},,,${rest}`;

async function send(body: unknown, withCookie = cookie) {
  const response = await api.request("/admin/v1/meeting-points/import", {
    method: "POST",
    headers: { cookie: withCookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function importFile(file: string, save: boolean) {
  const { status, body } = await send({ file, save });
  if (status !== 200) throw new Error(`Not read: ${String(status)} ${JSON.stringify(body)}`);
  return body as { rows: AdminImportRow[]; added: number };
}

async function pointsNamed(names: readonly string[]) {
  const { rows } = await api.connection.pool.query<{ id: string; name_is: string }>(
    "SELECT id, name_is FROM meeting_points WHERE name_is = ANY($1) ORDER BY id",
    [names],
  );
  return rows;
}

async function importEntriesWith(id: string) {
  const { rows } = await api.connection.pool.query<{
    operator_user_id: string;
    subject_type: string | null;
    subject_id: string | null;
    after: { added: number; skipped: number; points: { id: string; nameIs: string }[] };
  }>("SELECT * FROM audit_log WHERE action = 'meeting_point.imported' AND after::text LIKE $1", [
    `%${id}%`,
  ]);
  return rows;
}

describe("POST /admin/v1/meeting-points/import", () => {
  it("needs a console session", async () => {
    const { status } = await send({ file: header, save: false }, "");
    expect(status).toBe(401);
  });

  it("shows each row as it will be saved, and saves nothing", async () => {
    const file = [
      header,
      "Söluskálinn við Hraunsá,Hraunsá service station,Hyrnan,64.5383,-21.9206,fuel-station,west,Borgarbyggð,Við inngang verslunarinnar.,By the shop's entrance.,toilets|shop,,",
      row("Utan landsteina", "51.5,-0.12,other,west,London,,,,,"),
    ].join("\n");
    const { rows, added } = await importFile(file, false);
    expect(added).toBe(0);
    expect(rows).toEqual([
      {
        line: 2,
        nameIs: "Söluskálinn við Hraunsá",
        point: {
          nameEn: "Hraunsá service station",
          aliases: ["Hyrnan"],
          position: { latitude: 64.5383, longitude: -21.9206 },
          region: "west",
          municipality: "Borgarbyggð",
          type: "fuel-station",
          amenities: ["toilets", "shop"],
          whereToStandIs: "Við inngang verslunarinnar.",
          whereToStandEn: "By the shop's entrance.",
          season: null,
        },
        problems: [],
        id: null,
      },
      {
        line: 3,
        nameIs: "Utan landsteina",
        point: null,
        problems: [{ column: "position", issue: "outside_iceland" }],
        id: null,
      },
    ]);
    expect(await pointsNamed(["Söluskálinn við Hraunsá", "Utan landsteina"])).toEqual([]);
  });

  it("adds the rows without problems as drafts, with one audit entry", async () => {
    const file = [
      header,
      row("Bílastæði við Grábrók", "65.6603,-20.2797,fuel-station,northwest,Húnabyggð,,,shop,5,9"),
      row("Kringlan"),
      row("Áningarstaður við Laxá", "65.1206,-21.0905,fuel-station,northwest,Húnaþing vestra,,,,,"),
      row("Áningarstaður við Laxá"),
    ].join("\n");
    const { rows, added } = await importFile(file, true);
    expect(added).toBe(2);
    expect(rows.map((found) => [found.nameIs, found.problems])).toEqual([
      ["Bílastæði við Grábrók", []],
      // A sample point has this name already, and the file has the other twice.
      ["Kringlan", [{ column: "name_is", issue: "duplicate" }]],
      ["Áningarstaður við Laxá", []],
      ["Áningarstaður við Laxá", [{ column: "name_is", issue: "duplicate" }]],
    ]);
    const saved = await pointsNamed(["Bílastæði við Grábrók", "Áningarstaður við Laxá"]);
    expect(saved.map((point) => point.name_is)).toEqual([
      "Bílastæði við Grábrók",
      "Áningarstaður við Laxá",
    ]);
    expect(rows.map((found) => found.id)).toEqual([saved[0]?.id, null, saved[1]?.id, null]);

    const response = await api.request(`/admin/v1/meeting-points/${saved[0]?.id ?? ""}`, {
      headers: { cookie },
    });
    const point = (await response.json()) as AdminMeetingPoint;
    expect(point).toMatchObject({
      nameIs: "Bílastæði við Grábrók",
      status: "draft",
      season: { startMonth: 5, endMonth: 9 },
      amenities: ["shop"],
      lastCheckedOn: null,
      amenitiesReviewedOn: null,
      seasonReviewedOn: null,
    });

    const entries = await importEntriesWith(saved[0]?.id ?? "");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      operator_user_id: operatorId,
      subject_type: "meeting_point",
      subject_id: null,
      after: {
        added: 2,
        skipped: 2,
        points: [
          { id: saved[0]?.id, nameIs: "Bílastæði við Grábrók" },
          { id: saved[1]?.id, nameIs: "Áningarstaður við Laxá" },
        ],
      },
    });

    // The same file again adds nothing: every name is there now.
    const again = await importFile(file, true);
    expect(again.added).toBe(0);
    expect(again.rows.every((found) => found.id === null)).toBe(true);
    expect(await pointsNamed(["Bílastæði við Grábrók", "Áningarstaður við Laxá"])).toHaveLength(2);
  });

  it("says why a file cannot be read", async () => {
    const { status, body } = await send({
      file: 'name_is,latitude,colour\n"Hof,65.68',
      save: true,
    });
    expect(status).toBe(400);
    expect((body as ErrorResponse).error).toMatchObject({
      code: "validation_failed",
      details: [{ path: "lines.2", issue: "unclosed_quote" }],
    });

    const columns = await send({ file: "name_is,latitude,colour\nHof,65.68,red", save: false });
    expect((columns.body as ErrorResponse).error.details).toEqual([
      { path: "columns.colour", issue: "unknown_column" },
      { path: "columns.longitude", issue: "missing_column" },
      { path: "columns.type", issue: "missing_column" },
      { path: "columns.region", issue: "missing_column" },
      { path: "columns.municipality", issue: "missing_column" },
    ]);

    const empty = await send({ file: header, save: false });
    expect((empty.body as ErrorResponse).error.details).toEqual([{ path: "file", issue: "empty" }]);
  });

  it("refuses a file over 1 MB before reading it", async () => {
    const { status, body } = await send({ file: "x".repeat(2_200_000), save: false });
    expect(status).toBe(413);
    expect((body as ErrorResponse).error.code).toBe("payload_too_large");
  });
});
