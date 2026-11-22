// The sights' import file (spec 21, 3.6): a meeting point in the visitor
// car park of each main sight, in the console's import format, read here as
// the console's own reader reads it. The spots are OpenStreetMap's; the
// operator checks each one before it goes live.
import { readFileSync } from "node:fs";
import {
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
import { landmarkPlaces } from "./places.ts";
import { defaultRadiusM } from "./seed.ts";

const readDrafts = (name: string, existingNames: readonly string[] = []) => {
  const file = readFileSync(new URL(name, import.meta.url), "utf8");
  const read = readMeetingPointImport(file, { today: "2026-11-22", existingNames });
  return { read, rows: read.ok ? read.value : [] };
};

const settlements = readDrafts("./settlement-meeting-points.csv").rows.flatMap((row) =>
  row.ok ? [row.draft] : [],
);
// Read as if the settlement file were already imported: no name may clash.
const { read, rows } = readDrafts(
  "./sight-meeting-points.csv",
  settlements.map((draft) => draft.nameIs),
);
const drafts: ValidMeetingPointDraft[] = rows.flatMap((row) => (row.ok ? [row.draft] : []));

let graph: RoadGraph;
beforeAll(async () => {
  graph = await loadRoadGraph(process.env.ROAD_FILE);
});

describe("the sights' meeting points file", () => {
  it("reads through the console's import, every row without a problem, after the settlements", () => {
    expect(read.ok).toBe(true);
    expect(rows.filter((row) => !row.ok)).toEqual([]);
    expect(rows).toHaveLength(32);
    const names = drafts.map((draft) => draft.nameIs.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("puts every point in a car park, with where to stand in both languages", () => {
    for (const draft of drafts) {
      // A whole sentence in each language, and only what the map shows.
      const sentence = (text: string | null) => text?.endsWith(".") === true;
      expect({
        name: draft.nameIs,
        type: draft.type,
        amenities: draft.amenities,
        is: sentence(draft.whereToStandIs),
        en: sentence(draft.whereToStandEn),
      }).toEqual({
        name: draft.nameIs,
        type: "parking",
        amenities: ["parking"],
        is: true,
        en: true,
      });
    }
  });

  it("says where parking is paid, in both languages (spec 21, decision 6)", () => {
    for (const draft of drafts) {
      const paidIs = draft.whereToStandIs?.includes("Bílastæðið er gjaldskylt.") === true;
      const paidEn = draft.whereToStandEn?.includes("Parking here is paid.") === true;
      expect({ name: draft.nameIs, paidIs }).toEqual({ name: draft.nameIs, paidIs: paidEn });
    }
    const paid = (name: string) =>
      drafts
        .find((draft) => draft.nameIs === name)
        ?.whereToStandEn?.endsWith("Parking here is paid.");
    expect(paid("Þingvellir – Hakið")).toBe(true);
    expect(paid("Kerið")).toBe(false);
  });

  it("is in use all year, but Látrabjarg in summer", () => {
    expect(
      drafts.filter((draft) => draft.season !== null).map((draft) => [draft.nameIs, draft.season]),
    ).toEqual([["Látrabjarg", { startMonth: 5, endMonth: 9 }]]);
  });

  it("gives every landmark of place search a point within its reach", () => {
    const unreached = landmarkPlaces
      .filter(
        (place) =>
          !drafts.some(
            (draft) =>
              metresBetween(draft.position, place.position) <=
              (place.matchRadiusM ?? defaultRadiusM[place.kind]),
          ),
      )
      .map((place) => place.key);
    expect(unreached).toEqual([]);
    expect(landmarkPlaces).toHaveLength(32);
  });

  it(
    "joins every point to a road within 1 km that reaches BSÍ and back",
    { timeout: 60_000 },
    () => {
      const bsiDraft = settlements.find((draft) => draft.nameIs === "BSÍ");
      expect(bsiDraft).toBeDefined();
      const bsi = joinRoad(graph, (bsiDraft as ValidMeetingPointDraft).position) as RoadPosition;
      const joined = drafts.map((draft) => ({
        name: draft.nameIs,
        road: joinRoad(graph, draft.position),
      }));
      expect(joined.filter((point) => point.road === null).map((point) => point.name)).toEqual([]);
      const roads = joined.map((point) => point.road as RoadPosition);
      const from = legsFrom(graph, bsi, roads);
      const to = legsTo(graph, bsi, roads);
      const cut = joined
        .filter((_, index) => from[index] === null || to[index] === null)
        .map((point) => point.name);
      expect(cut).toEqual([]);
    },
  );
});
