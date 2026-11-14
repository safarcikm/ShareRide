import { createHash } from "node:crypto";
import { legsFromRoadGraph, normaliseSearchText, type PlaceKind } from "@shareride/domain";
import { and, eq, inArray, notInArray, or } from "drizzle-orm";
import type { Database } from "../index.ts";
import { legs, meetingPoints, places } from "../schema/index.ts";
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

const searchText = (names: readonly (string | undefined)[]) =>
  normaliseSearchText(names.filter((name) => name !== undefined).join(" "));

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
        status: "active",
        sample: true,
        searchText: searchText([point.nameIs, point.nameEn, ...(point.aliases ?? [])]),
      };
      await tx
        .insert(meetingPoints)
        .values(row)
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
        searchText: searchText([place.nameIs, place.nameEn, ...(place.aliases ?? [])]),
      };
      await tx
        .insert(places)
        .values(row)
        .onConflictDoUpdate({ target: places.id, set: { ...row, updatedAt: now } });
    }
    await tx.delete(places).where(and(eq(places.sample, true), notInArray(places.id, placeIds)));

    // Legs touching any sample point, listed or retired, are recomputed from
    // the road graph each time; retired points get none.
    const samplePointIds = tx
      .select({ id: meetingPoints.id })
      .from(meetingPoints)
      .where(eq(meetingPoints.sample, true));
    await tx
      .delete(legs)
      .where(
        or(
          inArray(legs.fromMeetingPointId, samplePointIds),
          inArray(legs.toMeetingPointId, samplePointIds),
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
    if (rows.length > 0) await tx.insert(legs).values(rows);
  });
}
