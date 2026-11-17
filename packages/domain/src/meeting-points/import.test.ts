import { describe, expect, it } from "vitest";
import { importLimits, readMeetingPointImport, type ImportRow } from "./import.ts";

const today = "2026-11-17";

const header =
  "name_is,name_en,aliases,latitude,longitude,type,region,municipality,where_to_stand_is,where_to_stand_en,amenities,season_start,season_end";

/** Made-up points along Route 1, in the file's columns. */
const borgarnes =
  "N1 Borgarnesi,N1 Borgarnes,Borgarnes|n1 borgarnes,64.5383,-21.9206,fuel-station,west,Borgarbyggð,Við inngang verslunarinnar.,By the shop's entrance.,toilets|shop,,";
const blonduos = "Olís Blönduósi,,,65.6603,-20.2797,fuel-station,northwest,Húnabyggð,,,shop,5,9";

const read = (text: string, existingNames: readonly string[] = []) =>
  readMeetingPointImport(text, { today, existingNames });

function rowsOf(text: string, existingNames: readonly string[] = []): readonly ImportRow[] {
  const result = read(text, existingNames);
  if (!result.ok) throw new Error(`The file was refused: ${JSON.stringify(result.error)}`);
  return result.value;
}

const problemsOf = (row: ImportRow | undefined) => (row?.ok === false ? row.problems : []);

describe("readMeetingPointImport", () => {
  it("reads each row into a draft, tidied as the form would", () => {
    const rows = rowsOf([header, borgarnes, blonduos].join("\n"));
    expect(rows).toEqual([
      {
        line: 2,
        nameIs: "N1 Borgarnesi",
        ok: true,
        draft: {
          nameIs: "N1 Borgarnesi",
          nameEn: "N1 Borgarnes",
          aliases: ["Borgarnes"],
          position: { latitude: 64.5383, longitude: -21.9206 },
          region: "west",
          municipality: "Borgarbyggð",
          type: "fuel-station",
          amenities: ["toilets", "shop"],
          whereToStandIs: "Við inngang verslunarinnar.",
          whereToStandEn: "By the shop's entrance.",
          shelterHours: null,
          shelterNoteIs: null,
          shelterNoteEn: null,
          season: null,
          lastCheckedOn: null,
        },
      },
      {
        line: 3,
        nameIs: "Olís Blönduósi",
        ok: true,
        draft: expect.objectContaining({
          nameEn: null,
          aliases: [],
          whereToStandIs: null,
          amenities: ["shop"],
          season: { startMonth: 5, endMonth: 9 },
        }) as unknown,
      },
    ]);
  });

  it("drops an alias that repeats a name, as the form does", () => {
    const [row] = rowsOf([header, borgarnes].join("\n"));
    expect(row?.ok === true ? row.draft.aliases : null).toEqual(["Borgarnes"]);
  });

  it("takes columns in any order, and leaves out the ones that may be empty", () => {
    const rows = rowsOf(
      [
        "region,type,municipality,longitude,latitude,name_is",
        "west,parking,Borgarbyggð,-21.9,64.54,Bílastæði við Hyrnutorg",
      ].join("\r\n"),
    );
    expect(rows[0]).toMatchObject({
      ok: true,
      draft: { nameIs: "Bílastæði við Hyrnutorg", position: { latitude: 64.54, longitude: -21.9 } },
    });
  });

  it("reads a file saved by Icelandic Excel: semicolons, decimal commas and a byte order mark", () => {
    const rows = rowsOf(
      [
        "﻿name_is;latitude;longitude;type;region;municipality;amenities",
        "Olís Blönduósi;65,6603;-20,2797;fuel-station;northwest;Húnabyggð;shop|toilets",
      ].join("\r\n"),
    );
    expect(rows[0]).toMatchObject({
      ok: true,
      draft: {
        position: { latitude: 65.6603, longitude: -20.2797 },
        amenities: ["toilets", "shop"],
      },
    });
  });

  it("reads quoted cells with the separator, quotes and line breaks in them", () => {
    const rows = rowsOf(
      [
        "name_is,latitude,longitude,type,region,municipality,where_to_stand_en",
        '"Hof, Akureyri",65.6839,-18.0878,other,northeast,Akureyrarbær,"By the ""Hof"" sign,',
        'at the front."',
        "N1 Borgarnesi,64.5383,-21.9206,fuel-station,west,Borgarbyggð,",
      ].join("\n"),
    );
    expect(rows.map((row) => [row.line, row.nameIs])).toEqual([
      [2, "Hof, Akureyri"],
      [4, "N1 Borgarnesi"],
    ]);
    expect(rows[0]?.ok === true ? rows[0].draft.whereToStandEn : null).toBe(
      'By the "Hof" sign,\nat the front.',
    );
  });

  it("takes catalogue names in any case and skips empty lines", () => {
    const rows = rowsOf(
      [
        "name_is,latitude,longitude,type,region,municipality,amenities",
        "",
        "N1 Borgarnesi,64.5383,-21.9206,Fuel-Station,WEST,Borgarbyggð, Toilets | ",
        ",,,,,,",
        "",
      ].join("\n"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      line: 3,
      ok: true,
      draft: { type: "fuel-station", region: "west", amenities: ["toilets"] },
    });
  });

  it("gives every problem of a row by its column, in the columns' order", () => {
    const rows = rowsOf(
      [
        header,
        ",,,64.5,,lorry-park,north,,,,sauna,13,",
        "Fjarri,,,51.5,-0.12,other,west,London,,,,,",
        "Hnit,,,sextíu,-21.9,other,west,Borgarbyggð,,,,,",
      ].join("\n"),
    );
    expect(problemsOf(rows[0])).toEqual([
      { column: "name_is", issue: "required" },
      { column: "longitude", issue: "required" },
      { column: "type", issue: "unknown" },
      { column: "region", issue: "unknown" },
      { column: "municipality", issue: "required" },
      { column: "amenities", issue: "unknown" },
      { column: "season_start", issue: "invalid" },
      { column: "season_end", issue: "required" },
    ]);
    expect(problemsOf(rows[1])).toEqual([{ column: "position", issue: "outside_iceland" }]);
    expect(problemsOf(rows[2])).toEqual([{ column: "latitude", issue: "unreadable" }]);
    expect(rows.map((row) => row.nameIs)).toEqual(["", "Fjarri", "Hnit"]);
  });

  it("says when a text is too long or there are too many aliases", () => {
    const long = "x".repeat(81);
    const aliases = Array.from({ length: 11 }, (_, index) => `Nafn ${String(index)}`).join("|");
    const rows = rowsOf(
      [
        "name_is,aliases,latitude,longitude,type,region,municipality",
        `${long},${aliases},64.5,-21.9,other,west,Borgarbyggð`,
      ].join("\n"),
    );
    expect(problemsOf(rows[0])).toEqual([
      { column: "name_is", issue: "too_long" },
      { column: "aliases", issue: "too_many" },
    ]);
  });

  it("marks a name that is already a meeting point or an earlier row", () => {
    const rows = rowsOf(
      [header, borgarnes, blonduos, borgarnes.replace("N1 Borgarnesi", "n1 borgarnesi ")].join(
        "\n",
      ),
      ["Olis Blonduosi"],
    );
    expect(rows.map((row) => row.ok)).toEqual([true, false, false]);
    expect(problemsOf(rows[1])).toEqual([{ column: "name_is", issue: "duplicate" }]);
    expect(problemsOf(rows[2])).toEqual([{ column: "name_is", issue: "duplicate" }]);
  });

  it("says when a row has more or fewer cells than the header", () => {
    const rows = rowsOf(
      [
        "name_is,latitude,longitude,type,region,municipality",
        "N1 Borgarnesi,64.5383,-21.9206,fuel-station,west",
        "Olís Blönduósi,65.6603,-20.2797,fuel-station,northwest,Húnabyggð,extra",
      ].join("\n"),
    );
    expect(rows.map(problemsOf)).toEqual([
      [{ column: "row", issue: "cells" }],
      [{ column: "row", issue: "cells" }],
    ]);
    expect(rows.map((row) => row.nameIs)).toEqual(["N1 Borgarnesi", "Olís Blönduósi"]);
  });

  describe("refuses a file it cannot read", () => {
    it("with no rows", () => {
      expect(read("")).toEqual({ ok: false, error: [{ issue: "empty" }] });
      expect(read(`${header}\n\n`)).toEqual({ ok: false, error: [{ issue: "empty" }] });
    });

    it("not saved as UTF-8", () => {
      expect(read(`${header}\nOl�s,65.66,-20.28,other,west,H�nabygg�`)).toEqual({
        ok: false,
        error: [{ issue: "not_utf8" }],
      });
    });

    it("with columns it does not know, repeats or misses", () => {
      expect(read("name_is,latitude,latitude,type,colour\nA,64,-21,other,red")).toEqual({
        ok: false,
        error: [
          { issue: "repeated_column", column: "latitude" },
          { issue: "unknown_column", column: "colour" },
          { issue: "missing_column", column: "longitude" },
          { issue: "missing_column", column: "region" },
          { issue: "missing_column", column: "municipality" },
        ],
      });
    });

    it("with a quote that is never closed", () => {
      expect(
        read(
          [
            "name_is,latitude,longitude,type,region,municipality",
            "Hof,65.68,-18.09,other,northeast,Akureyrarbær",
            '"Hof, Akureyri,65.68,-18.09,other,northeast,Akureyrarbær',
          ].join("\n"),
        ),
      ).toEqual({ ok: false, error: [{ issue: "unclosed_quote", line: 3 }] });
    });

    it("with more rows than one import takes", () => {
      const row = "Staður,64.5,-21.9,other,west,Borgarbyggð";
      const text = [
        "name_is,latitude,longitude,type,region,municipality",
        ...Array.from({ length: importLimits.maxRows + 1 }, () => row),
      ].join("\n");
      expect(read(text)).toEqual({ ok: false, error: [{ issue: "too_many_rows" }] });
    });
  });
});
