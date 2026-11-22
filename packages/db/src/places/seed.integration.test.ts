import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseConnection } from "../index.ts";
import { places } from "../schema/index.ts";
import { freshTestDatabase } from "../testing.ts";
import { allPlaces } from "./places.ts";
import { placeId, seedPlaces } from "./seed.ts";

describe("seedPlaces (spec 21, 3.2)", () => {
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = await freshTestDatabase();
  });

  afterAll(async () => {
    await connection.close();
  });

  it("adds every place as reference data, not sample data", async () => {
    await seedPlaces(connection.db, new Date("2026-11-22T12:00:00Z"));
    const rows = await connection.db.select().from(places);
    expect(rows).toHaveLength(allPlaces.length);
    expect(rows.some((row) => row.sample)).toBe(false);
    expect(rows.find((row) => row.id === placeId("hvammstangi"))).toMatchObject({
      nameIs: "Hvammstangi",
      kind: "village",
      region: "northwest",
      matchRadiusM: 5_000,
      searchText: "hvammstangi",
    });
    expect(rows.find((row) => row.id === placeId("hofn"))).toMatchObject({
      nameIs: "Höfn",
      aliases: ["Höfn í Hornafirði", "Hornafjörður"],
      kind: "town",
      region: "south",
      matchRadiusM: 10_000,
    });
    expect(rows.find((row) => row.id === placeId("alftanes"))?.municipalities).toEqual([
      "Garðabær",
    ]);
  });

  it("updates a place that is there, the sample ones too, and deletes none", async () => {
    const vik = placeId("vik-town");
    const kept = placeId("test:kept");
    await connection.db
      .update(places)
      .set({ nameIs: "Vík gamla", sample: true })
      .where(eq(places.id, vik));
    await connection.db.insert(places).values({
      id: kept,
      nameIs: "Staður sem er ekki á listanum",
      location: { latitude: 64, longitude: -21 },
      kind: "village",
      region: "south",
      matchRadiusM: 5_000,
      sample: true,
      searchText: "stadur sem er ekki a listanum",
    });
    await seedPlaces(connection.db, new Date("2026-11-23T12:00:00Z"));
    const rows = await connection.db.select().from(places);
    expect(rows).toHaveLength(allPlaces.length + 1);
    expect(rows.find((row) => row.id === vik)).toMatchObject({ nameIs: "Vík", sample: false });
    expect(rows.find((row) => row.id === kept)).toBeDefined();
  });
});
