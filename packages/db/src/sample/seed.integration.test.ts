import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseConnection } from "../index.ts";
import { corridors, legs, meetingPoints, places } from "../schema/index.ts";
import { freshTestDatabase } from "../testing.ts";
import { allPlaces } from "../places/places.ts";
import { samplePoints } from "./meeting-points.ts";
import {
  sampleCorridors,
  sampleId,
  sampleLegSource,
  seedSampleCorridors,
  seedSampleMeetingPoints,
} from "./seed.ts";

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
    expect(rows).toHaveLength(allPlaces.length);
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

  it("keeps the legs the road file gave sample points, but not those of a point the list moves", async () => {
    const bsi = sampleId("point:bsi");
    const akureyri = sampleId("point:akureyri");
    const borgarnes = sampleId("point:borgarnes");
    const real = sampleId("test:real");
    const roadFile = "road file 2026-11-16T21:22:36.000Z";
    const between = (from: string, to: string) =>
      sql`${legs.fromMeetingPointId} = ${from} and ${legs.toMeetingPointId} = ${to}`;
    const leg = async (from: string, to: string) =>
      (await connection.db.select().from(legs).where(between(from, to)))[0];
    await connection.db.insert(meetingPoints).values({
      id: real,
      nameIs: "Raunverulegur staður",
      searchText: "raunverulegur stadur",
      location: { latitude: 64.1, longitude: -21.9 },
      region: "capital",
      municipality: "Reykjavík",
      type: "other",
      status: "active",
    });
    // "Recompute all" put road file legs on the sample points too.
    await connection.db
      .update(legs)
      .set({ distanceM: 388_100, source: roadFile })
      .where(
        sql`${legs.fromMeetingPointId} in (${bsi}, ${borgarnes}) or ${legs.toMeetingPointId} = ${borgarnes}`,
      );
    await connection.db.insert(legs).values({
      fromMeetingPointId: bsi,
      toMeetingPointId: real,
      distanceM: 3000,
      durationS: 300,
      computedAt: now,
      source: roadFile,
    });
    // Borgarnes is somewhere else in the database than in the list, as when
    // the list moves a point.
    await connection.db
      .update(meetingPoints)
      .set({ location: { latitude: 64.6, longitude: -21.9 } })
      .where(eq(meetingPoints.id, borgarnes));

    await seedSampleMeetingPoints(connection.db, new Date("2026-11-17T12:00:00Z"));

    expect(await leg(bsi, akureyri)).toMatchObject({ distanceM: 388_100, source: roadFile });
    expect(await leg(bsi, real)).toMatchObject({ source: roadFile });
    expect(await leg(bsi, borgarnes)).toMatchObject({ source: sampleLegSource });
    expect(await leg(borgarnes, bsi)).toMatchObject({ source: sampleLegSource });
    expect(await connection.db.$count(legs)).toBe(
      samplePoints.length * (samplePoints.length - 1) + 1,
    );
  });

  it("keeps the status the console gave a sample point, so a deploy does not undo a pause", async () => {
    const bsi = sampleId("point:bsi");
    await connection.db
      .update(meetingPoints)
      .set({ status: "paused", pauseReasonIs: "Lokað.", pauseReasonEn: "Closed." })
      .where(eq(meetingPoints.id, bsi));
    await seedSampleMeetingPoints(connection.db, new Date("2026-11-16T12:00:00Z"));
    const [point] = await connection.db
      .select()
      .from(meetingPoints)
      .where(eq(meetingPoints.id, bsi));
    expect(point).toMatchObject({ status: "paused", pauseReasonEn: "Closed." });
  });
});

describe("seedSampleCorridors", () => {
  let connection: DatabaseConnection;
  const now = new Date("2026-11-14T12:00:00Z");

  beforeAll(async () => {
    connection = await freshTestDatabase();
    await seedSampleMeetingPoints(connection.db, now);
    await seedSampleCorridors(connection.db, now);
  });

  afterAll(async () => {
    await connection.close();
  });

  it("adds the three launch corridors, each of sample places that exist", async () => {
    const rows = await connection.db.select().from(corridors);
    expect(rows.map((row) => row.name).sort()).toEqual(
      sampleCorridors.map((corridor) => corridor.name).sort(),
    );
    const known = new Set((await connection.db.select().from(places)).map((place) => place.id));
    expect(rows.flatMap((row) => row.placeIds).filter((id) => !known.has(id))).toEqual([]);
    expect(rows.every((row) => row.active)).toBe(true);
  });

  it("leaves a corridor the operator changed as it is", async () => {
    const id = sampleId("corridor:west");
    await connection.db
      .update(corridors)
      .set({ name: "Vesturland", active: false })
      .where(eq(corridors.id, id));
    await seedSampleCorridors(connection.db, new Date("2026-11-15T12:00:00Z"));
    const rows = await connection.db.select().from(corridors);
    expect(rows).toHaveLength(sampleCorridors.length);
    expect(rows.find((row) => row.id === id)).toMatchObject({ name: "Vesturland", active: false });
  });
});
