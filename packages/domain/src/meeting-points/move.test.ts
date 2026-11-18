import { describe, expect, it } from "vitest";
import { canMove, metresMoved, pointMovedFar, moveSettings, validateMove } from "./move.ts";

/** The BSÍ bus terminal, and spots north of it. */
const bsi = { latitude: 64.137133, longitude: -21.933689 };
const north = (metres: number) => ({
  latitude: bsi.latitude + metres / 111_195,
  longitude: bsi.longitude,
});

describe("moving a meeting point in use (spec 2, 3.6.6; R2.10)", () => {
  it("is for points in service; a draft's spot is edited, and a retired point stays", () => {
    expect(canMove("active")).toBe(true);
    expect(canMove("paused")).toBe(true);
    expect(canMove("retiring")).toBe(true);
    expect(canMove("draft")).toBe(false);
    expect(canMove("retired")).toBe(false);
  });

  it("tells the trips that stop there only beyond 50 m", () => {
    expect(moveSettings.tellBeyondMetres).toBe(50);
    expect(pointMovedFar(bsi, north(49))).toBe(false);
    expect(pointMovedFar(bsi, north(51))).toBe(true);
    expect(pointMovedFar(bsi, north(51), { tellBeyondMetres: 100 })).toBe(false);
  });

  it("says how far it moved, in whole metres", () => {
    expect(metresMoved(bsi, north(120))).toBe(120);
    expect(metresMoved(bsi, bsi)).toBe(0);
  });

  it("takes a new spot in Iceland, kept to six decimals", () => {
    expect(validateMove(bsi, { latitude: 64.1381234567, longitude: -21.9341234567 })).toEqual({
      ok: true,
      value: { latitude: 64.138123, longitude: -21.934123 },
    });
    expect(validateMove(bsi, { latitude: 60.0, longitude: -21.9 })).toEqual({
      ok: false,
      error: "outside_iceland",
    });
  });

  it("refuses the spot it is at already", () => {
    expect(validateMove(bsi, { latitude: 64.1371334, longitude: -21.9336886 })).toEqual({
      ok: false,
      error: "same_place",
    });
  });
});
