import { searchTextFor, type PlaceKind } from "@shareride/domain";
import type { Database } from "../index.ts";
import { places } from "../schema/index.ts";
import { stableId } from "../stable-id.ts";
import { allPlaces, type Place } from "./places.ts";

/** A place's ID, the same on every run and in every environment. */
export const placeId = (key: string): string => stableId(`place:${key}`);

/** How far a search for a place reaches by default (spec 4, R4.2). */
export const defaultRadiusM: Readonly<Record<PlaceKind, number>> = {
  area: 20_000,
  town: 10_000,
  village: 5_000,
  landmark: 5_000,
};

const rowOf = (place: Place) => ({
  id: placeId(place.key),
  nameIs: place.nameIs,
  nameEn: place.nameEn ?? null,
  aliases: [...(place.aliases ?? [])],
  location: place.position,
  kind: place.kind,
  region: place.region,
  matchRadiusM: place.matchRadiusM ?? defaultRadiusM[place.kind],
  municipalities: [...(place.municipalities ?? [])],
  sample: false,
  searchText: searchTextFor([place.nameIs, place.nameEn, ...(place.aliases ?? [])]),
});

/**
 * Adds or updates the places of place search (spec 19, 3.2), in every
 * environment: the migration command runs it after the migrations. A place
 * that is there is updated, the sample ones included; none is deleted, so a
 * corridor or a search log entry never loses its place.
 */
export async function seedPlaces(db: Database, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    for (const place of allPlaces) {
      const row = rowOf(place);
      await tx
        .insert(places)
        .values({ ...row, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: places.id, set: { ...row, updatedAt: now } });
    }
  });
}
