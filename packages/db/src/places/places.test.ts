import { describe, expect, it } from "vitest";
import { sampleCorridors } from "../sample/seed.ts";
import { allPlaces, settlementPlaces } from "./places.ts";

// The places of place search (spec 21, 3.2): Statistics Iceland's
// settlements with people in 2026, less the ferry islands, and the
// landmarks.

/** The keys the sample places had, which keep their IDs. */
const sampleKeys = [
  "capital-area",
  "kopavogur",
  "gardabaer",
  "hafnarfjordur",
  "seltjarnarnes",
  "mosfellsbaer-town",
  "reykjanesbaer",
  "grindavik",
  "akranes-town",
  "borgarnes-town",
  "bifrost",
  "stykkisholmur",
  "hvammstangi",
  "blonduos-town",
  "skagastrond",
  "varmahlid-village",
  "saudarkrokur-town",
  "akureyri-town",
  "dalvik",
  "hveragerdi-town",
  "selfoss-town",
  "thorlakshofn-town",
  "eyrarbakki",
  "hella-town",
  "hvolsvollur-town",
  "vik-town",
  "thingvellir",
  "geysir",
  "gullfoss",
  "seljalandsfoss",
  "skogafoss",
  "reynisfjara",
  "blue-lagoon",
];

describe("the places", () => {
  it("have unique keys and names", () => {
    const keys = allPlaces.map((place) => place.key);
    expect(new Set(keys).size).toBe(keys.length);
    const names = allPlaces.map((place) => place.nameIs);
    expect(new Set(names).size).toBe(names.length);
  });

  it("cover the 110 settlements, each once by its number", () => {
    const codes = settlementPlaces.map((place) => place.settlement?.code);
    expect(codes.every((code) => code !== undefined)).toBe(true);
    expect(new Set(codes).size).toBe(110);
    expect(settlementPlaces).toHaveLength(110);
    // Left out: the ferry islands (spec 2), Vestmannaeyjar, Hrísey and
    // Grímsey, and the 5 with nobody registered in 2026.
    for (const code of [1100, 670, 649, 673, 681, 903, 1101, 1121]) {
      expect(codes).not.toContain(code);
    }
    expect(settlementPlaces.every((place) => (place.settlement?.population ?? 0) > 0)).toBe(true);
  });

  it("make a settlement of 1 000 people a town and a smaller one a village, as the sample places were", () => {
    const kept = new Set(sampleKeys);
    for (const place of settlementPlaces) {
      if (kept.has(place.key) || place.kind === "area") continue;
      const people = place.settlement?.population ?? 0;
      expect({ key: place.key, kind: place.kind }).toEqual({
        key: place.key,
        kind: people >= 1000 ? "town" : "village",
      });
    }
  });

  it("keep every sample place's key, and every place a corridor names", () => {
    const keys = new Set(allPlaces.map((place) => place.key));
    for (const key of sampleKeys) expect(keys).toContain(key);
    for (const corridor of sampleCorridors) {
      for (const key of corridor.places) expect(keys).toContain(key);
    }
  });

  it("name each place as people say it, with the other forms as aliases", () => {
    const named = (key: string) => allPlaces.find((place) => place.key === key);
    expect(named("hofn")).toMatchObject({
      nameIs: "Höfn",
      aliases: ["Höfn í Hornafirði", "Hornafjörður"],
    });
    expect(named("vik-town")).toMatchObject({ nameIs: "Vík", aliases: ["Vík í Mýrdal"] });
    expect(named("reykholt-i-borgarfirdi")?.nameIs).toBe("Reykholt í Borgarfirði");
    expect(named("reykholt-i-biskupstungum")?.nameIs).toBe("Reykholt í Biskupstungum");
  });

  it("keep every position in Iceland, off the ferry islands", () => {
    for (const { key, position } of allPlaces) {
      expect({ key, inside: position.latitude > 63.3 && position.latitude < 66.6 }).toEqual({
        key,
        inside: true,
      });
      expect(position.longitude).toBeGreaterThan(-24.6);
      expect(position.longitude).toBeLessThan(-13.4);
    }
  });
});
