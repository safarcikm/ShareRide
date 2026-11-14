import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseConnection } from "../index.ts";
import { legs, meetingPoints, places } from "../schema/index.ts";
import { freshTestDatabase } from "../testing.ts";
import { samplePlaces, samplePoints } from "./meeting-points.ts";
import { sampleId, sampleLegSource, seedSampleMeetingPoints } from "./seed.ts";

describe("seedSampleMeetingPoints", () => {
  let connection: DatabaseConnection;
  const now = new Date("2026-11-14T12:00:00Z");

  beforeAll(async () => {
    connection = await freshTestDatabase();
    await seedSampleMeetingPoints(connection.db, now);
  });

  afterAll(async () => {
    await connection.close();
  });

  it("adds every sample point as active sample data, with its position", async () => {
    const rows = await connection.db.select().from(meetingPoints);
    expect(rows).toHaveLength(samplePoints.length);
    expect(rows.every((row) => row.sample && row.status === "active")).toBe(true);
    const bsi = rows.find((row) => row.id === sampleId("point:bsi"));
    expect(bsi).toMatchObject({
      nameIs: "BSÍ",
      nameEn: "BSÍ bus terminal",
      location: { latitude: 64.1374, longitude: -21.9356 },
      searchText: "bsi bsi bus terminal umferdarmidstodin",
    });
  });

  it("adds the places, with the capital area covering its six municipalities", async () => {
    const rows = await connection.db.select().from(places);
    expect(rows).toHaveLength(samplePlaces.length);
    const capital = rows.find((row) => row.id === sampleId("place:capital-area"));
    expect(capital?.municipalities).toHaveLength(6);
    expect(rows.find((row) => row.nameIs === "Akureyri")?.matchRadiusM).toBe(10_000);
  });

  it("adds a leg each way between every pair of points, from the road graph", async () => {
    const rows = await connection.db.select().from(legs);
    expect(rows).toHaveLength(samplePoints.length * (samplePoints.length - 1));
    expect(rows.every((row) => row.source === sampleLegSource)).toBe(true);
    const [reykjavikToAkureyri] = await connection.db
      .select()
      .from(legs)
      .where(
        sql`${legs.fromMeetingPointId} = ${sampleId("point:bsi")} and ${legs.toMeetingPointId} = ${sampleId("point:akureyri")}`,
      );
    expect(reykjavikToAkureyri?.distanceM).toBe(385_000);
  });

  it("updates rather than duplicates, and retires sample points no longer listed", async () => {
    const retired = sampleId("point:old");
    const alsoRetired = sampleId("point:older");
    const oldPoint = {
      location: { latitude: 64, longitude: -21 },
      region: "south",
      municipality: "Árborg",
      type: "other",
      status: "active",
      sample: true,
    };
    await connection.db.insert(meetingPoints).values([
      { ...oldPoint, id: retired, nameIs: "Gamall staður", searchText: "gamall stadur" },
      { ...oldPoint, id: alsoRetired, nameIs: "Eldri staður", searchText: "eldri stadur" },
    ]);
    // A leg between two points that are no longer listed goes too.
    await connection.db.insert(legs).values({
      fromMeetingPointId: retired,
      toMeetingPointId: alsoRetired,
      distanceM: 1000,
      durationS: 60,
      computedAt: new Date("2026-11-14T12:00:00Z"),
      source: sampleLegSource,
    });
    await seedSampleMeetingPoints(connection.db, new Date("2026-11-15T12:00:00Z"));
    const rows = await connection.db.select().from(meetingPoints);
    expect(rows).toHaveLength(samplePoints.length + 2);
    const [old] = await connection.db
      .select()
      .from(meetingPoints)
      .where(eq(meetingPoints.id, retired));
    expect(old?.status).toBe("retired");
    expect(await connection.db.$count(legs)).toBe(samplePoints.length * (samplePoints.length - 1));
  });
});
