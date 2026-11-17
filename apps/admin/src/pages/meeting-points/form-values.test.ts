import type { AdminMeetingPoint } from "@shareride/contracts";
import { describe, expect, it } from "vitest";
import { emptyValues, inputOf, problemFieldsOf, valuesOf } from "./form-values.ts";

const today = "2026-11-17";

/** A made-up shelter at Hveragerði with every field given. */
const point: AdminMeetingPoint = {
  id: "0196f000-0000-7000-8000-0000000000c3",
  nameIs: "Skýlið við Hveragerði",
  nameEn: "Hveragerði shelter",
  aliases: ["Hveragerdi", "Skýlið"],
  position: { latitude: 63.99938, longitude: -21.18525 },
  region: "south",
  municipality: "Hveragerðisbær",
  type: "bus-hub",
  amenities: ["shelter", "toilets"],
  whereToStandIs: "Inni í skýlinu.",
  whereToStandEn: "Inside the shelter.",
  shelterHours: [
    { opens: "00:00", closes: "24:00" },
    { opens: "07:00", closes: "24:00" },
    { opens: "07:00", closes: "23:30" },
    { opens: "22:00", closes: "02:00" },
    { opens: "07:00", closes: "23:30" },
    { opens: "10:00", closes: "18:00" },
    null,
  ],
  shelterNoteIs: "Lokað á jóladag.",
  shelterNoteEn: "Closed on Christmas Day.",
  season: { startMonth: 5, endMonth: 9 },
  status: "draft",
  pauseReason: null,
  pausedUntil: null,
  lastCheckedOn: "2026-11-12",
  reviewDueOn: null,
  amenitiesReviewedOn: "2026-11-12",
  seasonReviewedOn: null,
  sample: false,
  futureTrips: 0,
  createdAt: "2026-11-16T10:00:00.000Z",
  updatedAt: "2026-11-16T10:00:00.000Z",
};

describe("the form's values", () => {
  it("send a loaded point back as it was", () => {
    const result = inputOf(valuesOf(point), today);
    expect(result).toEqual({
      input: {
        nameIs: point.nameIs,
        nameEn: point.nameEn,
        aliases: point.aliases,
        position: point.position,
        region: point.region,
        municipality: point.municipality,
        type: point.type,
        amenities: point.amenities,
        whereToStandIs: point.whereToStandIs,
        whereToStandEn: point.whereToStandEn,
        shelterHours: point.shelterHours,
        shelterNoteIs: point.shelterNoteIs,
        shelterNoteEn: point.shelterNoteEn,
        season: point.season,
        lastCheckedOn: point.lastCheckedOn,
        amenitiesReviewed: true,
        seasonReviewed: false,
      },
    });
  });

  it("show midnight as 00:00, as a browser's time field can, and send it as 24:00", () => {
    const values = valuesOf(point);
    expect(values.hours[0]).toEqual({ opens: "00:00", closes: "00:00", closed: false });
    expect(values.hours[1]).toEqual({ opens: "07:00", closes: "00:00", closed: false });
    expect(values.hours[6]).toEqual({ opens: "", closes: "", closed: true });
  });

  it("leave out the hours and notes without a shelter", () => {
    const result = inputOf({ ...valuesOf(point), amenities: ["toilets"] }, today);
    expect(result).toMatchObject({
      input: { shelterHours: null, shelterNoteIs: null, shelterNoteEn: null },
    });
  });

  it("name each field's problem in the form's order", () => {
    const result = inputOf({ ...emptyValues, spot: "BSÍ", lastCheckedOn: "2026-11-18" }, today);
    expect(result).toEqual({
      problems: [
        { field: "nameIs", issue: "required" },
        { field: "position", issue: "unreadable" },
        { field: "region", issue: "required" },
        { field: "municipality", issue: "required" },
        { field: "type", issue: "required" },
        { field: "lastCheckedOn", issue: "in_future" },
      ],
    });
  });

  it("know which problems a change may fix", () => {
    expect(problemFieldsOf({ spot: "64.1, -21.9" })).toEqual(["position"]);
    expect(problemFieldsOf({ hours: [], startMonth: "5" })).toEqual(["shelterHours", "season"]);
    expect(problemFieldsOf({ amenities: ["shelter"] })).toEqual([
      "amenities",
      "shelterHours",
      "shelterNoteIs",
      "shelterNoteEn",
    ]);
    expect(problemFieldsOf({ amenitiesReviewed: true })).toEqual([]);
  });
});
