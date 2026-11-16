import { describe, expect, it } from "vitest";
import { stopsToCopy } from "./copy.ts";

const stops = [
  { meetingPointId: "bsi", offered: true },
  { meetingPointId: "borgarnes", offered: true },
  { meetingPointId: "blonduos", offered: false },
  { meetingPointId: "hof", offered: true },
] as const;

describe("the stops of a trip posted again (spec 6, 3.6)", () => {
  it("are the same stops, in the same order", () => {
    const allOffered = stops.map((stop) => ({ ...stop, offered: true }));
    expect(stopsToCopy(allOffered, { reverse: false })).toEqual({
      stops: ["bsi", "borgarnes", "blonduos", "hof"],
      dropped: [],
    });
  });

  it("are reversed for the return trip", () => {
    const allOffered = stops.map((stop) => ({ ...stop, offered: true }));
    expect(stopsToCopy(allOffered, { reverse: true })).toEqual({
      stops: ["hof", "blonduos", "borgarnes", "bsi"],
      dropped: [],
    });
  });

  it("leave out points no longer offered, and name them for the notice", () => {
    expect(stopsToCopy(stops, { reverse: false })).toEqual({
      stops: ["bsi", "borgarnes", "hof"],
      dropped: ["blonduos"],
    });
    expect(stopsToCopy(stops, { reverse: true })).toEqual({
      stops: ["hof", "borgarnes", "bsi"],
      dropped: ["blonduos"],
    });
  });

  it("leave the trip's own stops as they were", () => {
    const copied = [...stops];
    stopsToCopy(copied, { reverse: true });
    expect(copied).toEqual(stops);
  });
});
