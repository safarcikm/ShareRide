import {
  adminCorridorsRoute,
  adminCreateCorridorRoute,
  adminUpdateCorridorRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId, seedSampleMeetingPoints } from "@shareride/db/seed";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";

// The console's corridors (spec 10, 3.4.1; plan 4.5).

let api: TestApi;
let cookie: string;
let operatorId: string;
const place = (key: string) => sampleId(`place:${key}`);
const json = (body: unknown, method = "POST") => ({
  method,
  headers: { cookie, "content-type": "application/json", origin: "https://shareride.test" },
  body: JSON.stringify(body),
});

beforeAll(async () => {
  api = await startTestApi();
  await seedSampleMeetingPoints(api.connection.db, api.now());
  await api.connection.db.delete(schema.corridors);
  const operator = await api.signInOperator();
  cookie = operator.cookie;
  operatorId = operator.userId;
});

afterAll(async () => {
  await api.close();
});

interface Corridor {
  id: string;
  name: string;
  places: { id: string; name: string }[];
  active: boolean;
}

describe("the console's corridors", () => {
  it("needs an operator", async () => {
    const response = await api.request(adminCorridorsRoute.path);
    expect(response.status).toBe(401);
    const made = await api.request(adminCreateCorridorRoute.path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "South", placeIds: [] }),
    });
    expect(made.status).toBe(401);
  });

  it("adds a corridor with its places in order, lists it with every place, and notes it in the audit log", async () => {
    const placeIds = [place("capital-area"), place("hveragerdi-town"), place("selfoss-town")];
    const made = await api.request(
      adminCreateCorridorRoute.path,
      json({ name: " Reykjavík – Selfoss ", placeIds }),
    );
    expect(made.status).toBe(201);
    const corridor = (await made.json()) as Corridor;
    expect(corridor).toMatchObject({
      name: "Reykjavík – Selfoss",
      active: true,
      places: [
        { id: placeIds[0], name: "Reykjavík" },
        { id: placeIds[1], name: "Hveragerði" },
        { id: placeIds[2], name: "Selfoss" },
      ],
    });

    const listed = await api.request(adminCorridorsRoute.path, { headers: { cookie } });
    const body = (await listed.json()) as { corridors: Corridor[]; places: Corridor["places"] };
    expect(body.corridors.map((row) => row.id)).toEqual([corridor.id]);
    expect(body.places.length).toBeGreaterThan(10);
    expect(body.places).toContainEqual({ id: place("akranes-town"), name: "Akranes" });
    const names = body.places.map((row) => row.name);
    expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));

    const [entry] = await api.connection.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.subjectId, corridor.id));
    expect(entry).toMatchObject({
      action: "corridor.created",
      subjectType: "corridor",
      operatorUserId: operatorId,
      after: { name: "Reykjavík – Selfoss", placeIds, active: true },
    });
  });

  it("refuses a corridor without a name, with one place, with a place twice or with an unknown place", async () => {
    const two = [place("capital-area"), place("akranes-town")];
    const cases: [unknown, string, string][] = [
      [{ name: "  ", placeIds: two }, "name", "missing"],
      [{ name: "x".repeat(81), placeIds: two }, "name", "too_long"],
      [{ name: "West", placeIds: [two[0]] }, "placeIds", "too_few"],
      [{ name: "West", placeIds: [...two, two[0]] }, "placeIds", "twice"],
      [{ name: "West", placeIds: [two[0], sampleId("place:nowhere")] }, "placeIds", "not_found"],
    ];
    for (const [body, path, issue] of cases) {
      const response = await api.request(adminCreateCorridorRoute.path, json(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: "validation_failed", details: [{ path, issue }] },
      });
    }
    expect(await api.connection.db.select().from(schema.corridors)).toHaveLength(1);
  });

  it("changes the name, the places or whether it is active, each alone, with the change in the audit log", async () => {
    const [stored] = await api.connection.db.select().from(schema.corridors);
    if (stored === undefined) throw new Error("No corridor.");
    const path = adminUpdateCorridorRoute.path.replace("{id}", stored.id);

    const off = await api.request(path, json({ active: false }, "PATCH"));
    expect(off.status).toBe(200);
    expect(await off.json()).toMatchObject({ active: false, name: stored.name });

    const shorter = [place("capital-area"), place("selfoss-town")];
    const changed = await api.request(path, json({ name: "South", placeIds: shorter }, "PATCH"));
    expect(await changed.json()).toMatchObject({
      name: "South",
      active: false,
      places: [{ name: "Reykjavík" }, { name: "Selfoss" }],
    });

    const bad = await api.request(path, json({ placeIds: [shorter[0]] }, "PATCH"));
    expect(bad.status).toBe(400);
    const missing = await api.request(
      adminUpdateCorridorRoute.path.replace("{id}", sampleId("corridor:none")),
      json({ active: true }, "PATCH"),
    );
    expect(missing.status).toBe(404);

    const entries = await api.connection.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.subjectId, stored.id));
    expect(entries.map((entry) => entry.action).sort()).toEqual([
      "corridor.changed",
      "corridor.changed",
      "corridor.created",
    ]);
    expect(entries.find((entry) => entry.action === "corridor.changed")).toMatchObject({
      before: { active: true },
      after: { active: false },
    });
  });
});
