import { legsFromRoadGraph, searchTextFor } from "@shareride/domain";
import { and, eq, inArray, notInArray, or } from "drizzle-orm";
import type { Database } from "../index.ts";
import { lockLegs } from "../legs.ts";
import { placeId, seedPlaces } from "../places/seed.ts";
import { corridors, legs, meetingPoints } from "../schema/index.ts";
import { stableId } from "../stable-id.ts";
import { samplePoints, sampleRoads } from "./meeting-points.ts";

/** Where the sample legs come from, as stored with each leg. */
export const sampleLegSource = "sample road graph, approximate (milestone 3)";

/**
 * The same ID for the same sample key on every run, so the seed updates its
 * rows instead of adding new ones: a UUID (version 8) from a hash of the key.
 */
export const sampleId = stableId;

/**
 * Adds or updates the places (`seedPlaces`, which every environment has),
 * then the sample meeting points and their legs. Sample points that are no
 * longer in the list are retired, never deleted (rule R2.2). Local
 * development and staging only (see seed-guard.ts).
 */
export async function seedSampleMeetingPoints(db: Database, now: Date): Promise<void> {
  await seedPlaces(db, now);
  const pointIds = new Map(
    samplePoints.map((point) => [point.key, sampleId(`point:${point.key}`)]),
  );
  await db.transaction(async (tx) => {
    await lockLegs(tx);
    // Where the sample points were, to tell which ones the list moves.
    const before = new Map(
      (
        await tx
          .select({ id: meetingPoints.id, location: meetingPoints.location })
          .from(meetingPoints)
          .where(eq(meetingPoints.sample, true))
      ).map((point) => [point.id, point.location]),
    );
    const moved: string[] = [];
    for (const point of samplePoints) {
      const row = {
        id: pointIds.get(point.key) ?? "",
        nameIs: point.nameIs,
        nameEn: point.nameEn ?? null,
        aliases: [...(point.aliases ?? [])],
        location: point.position,
        region: point.region,
        municipality: point.municipality,
        type: point.type,
        amenities: [...point.amenities],
        whereToStandIs: point.whereToStand.is,
        whereToStandEn: point.whereToStand.en,
        seasonStartMonth: null,
        seasonEndMonth: null,
        sample: true,
        searchText: searchTextFor([point.nameIs, point.nameEn, ...(point.aliases ?? [])]),
      };
      const was = before.get(row.id);
      if (
        was !== undefined &&
        (was.latitude !== point.position.latitude || was.longitude !== point.position.longitude)
      ) {
        moved.push(row.id);
      }
      // A new sample point starts active; one already there keeps the
      // status the console gave it, so a deploy does not undo a pause.
      await tx
        .insert(meetingPoints)
        .values({ ...row, status: "active" })
        .onConflictDoUpdate({ target: meetingPoints.id, set: { ...row, updatedAt: now } });
    }
    await tx
      .update(meetingPoints)
      .set({ status: "retired", updatedAt: now })
      .where(
        and(eq(meetingPoints.sample, true), notInArray(meetingPoints.id, [...pointIds.values()])),
      );

    // The road graph's legs touching any sample point, listed or retired,
    // are written again each time; retired points get none. Legs from our
    // road file ("Recompute all") stay, but not those of a point the list
    // moves: they were found from where it was.
    const samplePointIds = tx
      .select({ id: meetingPoints.id })
      .from(meetingPoints)
      .where(eq(meetingPoints.sample, true));
    await tx
      .delete(legs)
      .where(
        or(
          and(
            eq(legs.source, sampleLegSource),
            or(
              inArray(legs.fromMeetingPointId, samplePointIds),
              inArray(legs.toMeetingPointId, samplePointIds),
            ),
          ),
          ...(moved.length === 0
            ? []
            : [inArray(legs.fromMeetingPointId, moved), inArray(legs.toMeetingPointId, moved)]),
        ),
      );
    const graph = legsFromRoadGraph(
      sampleRoads.map(([from, to, km, minutes]) => ({
        from,
        to,
        distanceM: Math.round(km * 1000),
        durationS: minutes * 60,
      })),
    );
    const rows = graph.flatMap((leg) => {
      const from = pointIds.get(leg.from);
      const to = pointIds.get(leg.to);
      if (from === undefined || to === undefined) return []; // A junction, not a meeting point.
      return [
        {
          fromMeetingPointId: from,
          toMeetingPointId: to,
          distanceM: leg.distanceM,
          durationS: leg.durationS,
          computedAt: now,
          source: sampleLegSource,
        },
      ];
    });
    if (rows.length > 0) await tx.insert(legs).values(rows).onConflictDoNothing();
  });
}

/**
 * The three launch corridors (meeting points guide, "Launch corridors";
 * answer A35), as places in order. Reykjanesbær's place covers the
 * airport's meeting point.
 */
export const sampleCorridors: readonly {
  readonly key: string;
  readonly name: string;
  readonly places: readonly string[];
}[] = [
  {
    key: "south",
    name: "Reykjavík – Hveragerði – Selfoss",
    places: ["capital-area", "hveragerdi-town", "selfoss-town"],
  },
  {
    key: "airport",
    name: "Reykjavík – Reykjanesbær – Keflavíkurflugvöllur",
    places: ["capital-area", "reykjanesbaer"],
  },
  {
    key: "west",
    name: "Reykjavík – Akranes – Borgarnes",
    places: ["capital-area", "akranes-town", "borgarnes-town"],
  },
];

/**
 * Adds the launch corridors once, after the places. One that is
 * there is left alone, so a deploy never undoes the operator's change.
 * In production the operator adds them in the console, with the real places.
 */
export async function seedSampleCorridors(db: Database, now: Date): Promise<void> {
  await db
    .insert(corridors)
    .values(
      sampleCorridors.map((corridor) => ({
        id: sampleId(`corridor:${corridor.key}`),
        name: corridor.name,
        placeIds: corridor.places.map(placeId),
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing({ target: corridors.id });
}
