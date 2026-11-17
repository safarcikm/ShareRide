import { describe, expect, it } from "vitest";
import {
  meetingPointLimits,
  reviewedOn,
  validateMeetingPointDraft,
  type MeetingPointDraft,
} from "./draft.ts";

const today = "2026-11-17";

// A made-up point at Borgarnes, as the operator types it.
const draft: MeetingPointDraft = {
  nameIs: "N1 Borgarnesi",
  nameEn: "N1 Borgarnes",
  aliases: ["Borgarnes"],
  position: { latitude: 64.5383, longitude: -21.9206 },
  region: "west",
  municipality: "Borgarbyggð",
  type: "fuel-station",
  amenities: ["toilets", "shelter", "shop"],
  whereToStandIs: "Við inngang verslunarinnar.",
  whereToStandEn: "By the shop's entrance.",
  shelterHours: [
    { opens: "07:00", closes: "23:30" },
    { opens: "07:00", closes: "23:30" },
    { opens: "07:00", closes: "23:30" },
    { opens: "07:00", closes: "23:30" },
    { opens: "07:00", closes: "01:00" },
    { opens: "08:00", closes: "24:00" },
    null,
  ],
  shelterNoteIs: "Lokað á jóladag.",
  shelterNoteEn: "Closed on Christmas Day.",
  season: null,
  lastCheckedOn: "2026-11-16",
};

const problemsOf = (input: MeetingPointDraft) => {
  const result = validateMeetingPointDraft(input, today);
  return result.ok ? [] : result.error;
};

describe("validateMeetingPointDraft (spec 2, 3.6.2)", () => {
  it("takes a point with every field", () => {
    const result = validateMeetingPointDraft(draft, today);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      nameIs: "N1 Borgarnesi",
      nameEn: "N1 Borgarnes",
      region: "west",
      type: "fuel-station",
      lastCheckedOn: "2026-11-16",
    });
    // Amenities in the catalogue's order, so the same set is stored the same way.
    expect(result.value.amenities).toEqual(["shelter", "toilets", "shop"]);
  });

  it("takes a draft with only what the database needs: names, spot, region, municipality, type", () => {
    const result = validateMeetingPointDraft(
      {
        ...draft,
        nameEn: null,
        aliases: [],
        amenities: [],
        whereToStandIs: null,
        whereToStandEn: null,
        shelterHours: null,
        shelterNoteIs: null,
        shelterNoteEn: null,
        lastCheckedOn: null,
      },
      today,
    );
    expect(result.ok).toBe(true);
  });

  it("tidies texts: trimmed, one form of each accented letter, and empty as none", () => {
    const result = validateMeetingPointDraft(
      {
        ...draft,
        nameIs: "  Olís Norðlingaholti ",
        // "í" typed as "i" and a combining accent.
        municipality: "Reykjavíkurborg",
        whereToStandEn: "   ",
        shelterNoteIs: "",
      },
      today,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nameIs).toBe("Olís Norðlingaholti");
    expect(result.value.municipality).toBe("Reykjavíkurborg");
    expect(result.value.whereToStandEn).toBeNull();
    expect(result.value.shelterNoteIs).toBeNull();
  });

  it("stores no English name when it is the Icelandic one", () => {
    const result = validateMeetingPointDraft({ ...draft, nameEn: " N1 Borgarnesi" }, today);
    expect(result.ok && result.value.nameEn).toBeNull();
  });

  it("drops empty and repeated aliases, and aliases that are the name", () => {
    const result = validateMeetingPointDraft(
      {
        ...draft,
        aliases: ["Borgarnes", " ", "borgarnes", "BORGARNES ", "n1 borgarnesi", "Hyrnan"],
      },
      today,
    );
    expect(result.ok && result.value.aliases).toEqual(["Borgarnes", "Hyrnan"]);
  });

  it.each([
    ["nameIs", { nameIs: "  " }, "required"],
    ["nameIs", { nameIs: "x".repeat(meetingPointLimits.nameMaxLength + 1) }, "too_long"],
    ["nameEn", { nameEn: "x".repeat(meetingPointLimits.nameMaxLength + 1) }, "too_long"],
    ["municipality", { municipality: "" }, "required"],
    ["region", { region: "midlands" }, "unknown"],
    ["type", { type: "harbour" }, "unknown"],
    ["amenities", { amenities: ["shelter", "wifi"] }, "unknown"],
    ["position", { position: { latitude: 62.0107, longitude: -6.7741 } }, "outside_iceland"],
    [
      "whereToStandIs",
      { whereToStandIs: "x".repeat(meetingPointLimits.whereToStandMaxLength + 1) },
      "too_long",
    ],
    [
      "shelterNoteEn",
      { shelterNoteEn: "x".repeat(meetingPointLimits.shelterNoteMaxLength + 1) },
      "too_long",
    ],
    ["lastCheckedOn", { lastCheckedOn: "2026-11-18" }, "in_future"],
    ["season", { season: { startMonth: 0, endMonth: 9 } }, "invalid"],
    ["season", { season: { startMonth: 5, endMonth: 13 } }, "invalid"],
  ] as const)("names the field and the problem: %s %j", (field, change, issue) => {
    expect(problemsOf({ ...draft, ...change })).toEqual([{ field, issue }]);
  });

  it("limits the aliases in number and length", () => {
    const many = Array.from(
      { length: meetingPointLimits.aliasesMax + 1 },
      (_, i) => `Alias ${String(i)}`,
    );
    expect(problemsOf({ ...draft, aliases: many })).toEqual([
      { field: "aliases", issue: "too_many" },
    ]);
    const long = "x".repeat(meetingPointLimits.aliasMaxLength + 1);
    expect(problemsOf({ ...draft, aliases: ["Borgarnes", long] })).toEqual([
      { field: "aliases.1", issue: "too_long" },
    ]);
  });

  it("counts a name's length in letters, not in code units", () => {
    const letters = "Þ".repeat(meetingPointLimits.nameMaxLength);
    expect(problemsOf({ ...draft, nameIs: letters })).toEqual([]);
  });

  it("reads shelter hours as a week from Monday, each day closed or open from one time to another", () => {
    expect(problemsOf({ ...draft, shelterHours: draft.shelterHours?.slice(0, 6) ?? null })).toEqual(
      [{ field: "shelterHours", issue: "invalid" }],
    );
    const hours = [...(draft.shelterHours ?? [])];
    hours[2] = { opens: "7:00", closes: "23:00" };
    hours[3] = { opens: "08:00", closes: "08:00" };
    hours[4] = { opens: "24:00", closes: "10:00" };
    hours[5] = { opens: "06:00", closes: "24:30" };
    expect(problemsOf({ ...draft, shelterHours: hours })).toEqual([
      { field: "shelterHours.2", issue: "invalid" },
      { field: "shelterHours.3", issue: "invalid" },
      { field: "shelterHours.4", issue: "invalid" },
      { field: "shelterHours.5", issue: "invalid" },
    ]);
  });

  it("takes open all day, and closing after midnight", () => {
    const hours = Array.from({ length: 7 }, () => ({ opens: "00:00", closes: "24:00" }));
    hours[0] = { opens: "18:00", closes: "02:00" };
    expect(problemsOf({ ...draft, shelterHours: hours })).toEqual([]);
  });

  it("keeps shelter hours and the shelter note for a point with a shelter", () => {
    expect(problemsOf({ ...draft, amenities: ["toilets"] })).toEqual([
      { field: "shelterHours", issue: "needs_shelter" },
      { field: "shelterNoteIs", issue: "needs_shelter" },
      { field: "shelterNoteEn", issue: "needs_shelter" },
    ]);
    expect(
      problemsOf({
        ...draft,
        amenities: ["toilets"],
        shelterHours: null,
        shelterNoteIs: null,
        shelterNoteEn: null,
      }),
    ).toEqual([]);
  });

  it("takes a season of one month, and one across the new year", () => {
    expect(problemsOf({ ...draft, season: { startMonth: 7, endMonth: 7 } })).toEqual([]);
    expect(problemsOf({ ...draft, season: { startMonth: 11, endMonth: 3 } })).toEqual([]);
  });

  it("lists every problem at once, so the form can show them all", () => {
    expect(
      problemsOf({ ...draft, nameIs: "", municipality: " ", region: "midlands" }).map(
        (problem) => problem.field,
      ),
    ).toEqual(["nameIs", "region", "municipality"]);
  });

  it("keeps six decimals of the spot, about ten centimetres", () => {
    const result = validateMeetingPointDraft(
      { ...draft, position: { latitude: 64.53831234, longitude: -21.92064449 } },
      today,
    );
    expect(result.ok && result.value.position).toEqual({
      latitude: 64.538312,
      longitude: -21.920644,
    });
  });
});

describe("reviewedOn (rule R2.3: amenities and season reviewed)", () => {
  it("is today when first ticked, and keeps the first day while it stays ticked", () => {
    expect(reviewedOn(null, true, today)).toBe(today);
    expect(reviewedOn("2026-10-01", true, today)).toBe("2026-10-01");
  });

  it("is none once unticked", () => {
    expect(reviewedOn("2026-10-01", false, today)).toBeNull();
    expect(reviewedOn(null, false, today)).toBeNull();
  });
});
