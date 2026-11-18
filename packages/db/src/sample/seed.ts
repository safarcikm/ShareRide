import { createHash } from "node:crypto";
import { legsFromRoadGraph, searchTextFor, type PlaceKind } from "@shareride/domain";
import { and, eq, inArray, notInArray, or } from "drizzle-orm";
import type { Database } from "../index.ts";
import { lockLegs } from "../legs.ts";
import { corridors, legs, meetingPoints, places } from "../schema/index.ts";
import { samplePlaces, samplePoints, sampleRoads } from "./meeting-points.ts";

/** Where the sample legs come from, as stored with each leg. */
export const sampleLegSource = "sample road graph, approximate (milestone 3)";

/**
 * The same ID for the same sample key on every run, so the seed updates its
 * rows instead of adding new ones: a UUID (version 8) from a hash of the key.
 */
export function sampleId(key: string): string {
  const hex = createHash("sha256").update(`shareride-sample:${key}`).digest("hex");
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

/** How far a search for a place reaches by default (spec 4, R4.2). */
const defaultRadiusM: Readonly<Record<PlaceKind, number>> = {
  area: 20_000,
  town: 10_000,
  village: 5_000,
  landmark: 5_000,
};

/**
 * Adds or updates the sample meeting points, places and legs. Sample points
 * that are no longer in the list are retired, never deleted (rule R2.2).
 * Local development and staging only (see seed-guard.ts).
 */
export async function seedSampleMeetingPoints(db: Database, now: Date): Promise<void> {
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

    const placeIds: string[] = [];
    for (const place of samplePlaces) {
      const id = sampleId(`place:${place.key}`);
      placeIds.push(id);
      const row = {
        id,
        nameIs: place.nameIs,
        nameEn: place.nameEn ?? null,
        aliases: [...(place.aliases ?? [])],
        location: place.position,
        kind: place.kind,
        region: place.region,
        matchRadiusM: place.matchRadiusM ?? defaultRadiusM[place.kind],
        municipalities: [...(place.municipalities ?? [])],
        sample: true,
        searchText: searchTextFor([place.nameIs, place.nameEn, ...(place.aliases ?? [])]),
      };
      await tx
        .insert(places)
        .values(row)
        .onConflictDoUpdate({ target: places.id, set: { ...row, updatedAt: now } });
    }
    await tx.delete(places).where(and(eq(places.sample, true), notInArray(places.id, placeIds)));

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
 * answer A35), as sample places in order. Reykjanesbær's place covers the
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
 * Adds the launch corridors once, after the sample places. One that is
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
        placeIds: corridor.places.map((key) => sampleId(`place:${key}`)),
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing({ target: corridors.id });
}
