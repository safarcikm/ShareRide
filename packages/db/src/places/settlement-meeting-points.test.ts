// The import file of spec 21 (3.3 to 3.5): a meeting point in or near every
// settlement, in the console's import format, read here as the console's
// own reader reads it. The points are OpenStreetMap's spots; the operator
// checks each one before it goes live.
import { readFileSync } from "node:fs";
import {
  importLimits,
  joinRoad,
  legsFrom,
  legsTo,
  metresBetween,
  readMeetingPointImport,
  type RoadGraph,
  type RoadPosition,
  type ValidMeetingPointDraft,
} from "@shareride/domain";
import { beforeAll, describe, expect, it } from "vitest";
import { loadRoadGraph } from "../roads/load.ts";
import { allPlaces, settlementPlaces } from "./places.ts";
import { defaultRadiusM } from "./seed.ts";

const file = readFileSync(new URL("./settlement-meeting-points.csv", import.meta.url), "utf8");

const read = readMeetingPointImport(file, { today: "2026-11-22", existingNames: [] });
const rows = read.ok ? read.value : [];
const drafts: ValidMeetingPointDraft[] = rows.flatMap((row) => (row.ok ? [row.draft] : []));

let graph: RoadGraph;
beforeAll(async () => {
  graph = await loadRoadGraph(process.env.ROAD_FILE);
});

describe("the settlement meeting points file", () => {
  it("reads through the console's import, every row without a problem", () => {
    expect(read.ok).toBe(true);
    expect(rows.filter((row) => !row.ok)).toEqual([]);
    expect(rows).toHaveLength(104);
    expect(rows.length).toBeLessThanOrEqual(importLimits.maxRows);
    expect(Buffer.byteLength(file)).toBeLessThanOrEqual(importLimits.maxBytes);
  });

  it("names no point twice, and starts each settlement's name with its settlement", () => {
    const names = drafts.map((draft) => draft.nameIs.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(drafts.find((draft) => draft.nameIs.startsWith("Hvammstangi"))?.nameIs).toBe(
      "Hvammstangi – N1",
    );
  });

  it("gives every point where to stand in both languages, and its season all year", () => {
    for (const draft of drafts) {
      // A whole sentence in each language.
      const sentence = (text: string | null) => text?.endsWith(".") === true;
      expect({
        name: draft.nameIs,
        is: sentence(draft.whereToStandIs),
        en: sentence(draft.whereToStandEn),
      }).toEqual({ name: draft.nameIs, is: true, en: true });
      expect(draft.season).toBeNull();
    }
  });

  it("claims only what the map shows: parking at every forecourt and car park, toilets at none of them", () => {
    for (const draft of drafts.filter((point) =>
      ["fuel-station", "parking"].includes(point.type),
    )) {
      expect({ name: draft.nameIs, parking: draft.amenities.includes("parking") }).toEqual({
        name: draft.nameIs,
        parking: true,
      });
    }
    const toilets = drafts.filter(
      (draft) => draft.type === "parking" && draft.amenities.includes("toilets"),
    );
    expect(toilets).toEqual([]);
  });

  it("reaches a point from every place, by its municipalities or its reach", () => {
    const unreached = allPlaces
      .filter((place) => place.kind !== "landmark")
      .filter((place) =>
        (place.municipalities ?? []).length > 0
          ? !drafts.some((draft) => place.municipalities?.includes(draft.municipality))
          : !drafts.some(
              (draft) =>
                metresBetween(draft.position, place.position) <=
                (place.matchRadiusM ?? defaultRadiusM[place.kind]),
            ),
      )
      .map((place) => place.key);
    expect(unreached).toEqual([]);
    expect(settlementPlaces).toHaveLength(110);
  });

  it(
    "joins every point to a road within 1 km that reaches BSÍ and back",
    { timeout: 60_000 },
    () => {
      const joined = drafts.map((draft) => ({
        name: draft.nameIs,
        road: joinRoad(graph, draft.position),
      }));
      expect(joined.filter((point) => point.road === null).map((point) => point.name)).toEqual([]);
      const roads = joined.map((point) => point.road as RoadPosition);
      const bsi = roads[drafts.findIndex((draft) => draft.nameIs === "BSÍ")];
      expect(bsi).toBeDefined();
      const from = legsFrom(graph, bsi as RoadPosition, roads);
      const to = legsTo(graph, bsi as RoadPosition, roads);
      const cut = joined
        .filter((_, index) => from[index] === null || to[index] === null)
        .map((point) => point.name);
      expect(cut).toEqual([]);
    },
  );
});
