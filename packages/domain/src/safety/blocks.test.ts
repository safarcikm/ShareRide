import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkBlock, hiddenFrom, isBlockedBetween, tripClosedTo, type Block } from "./blocks.ts";

const blocks: readonly Block[] = [
  { blockerId: "gunna", blockedId: "jon" },
  { blockerId: "anna", blockedId: "gunna" },
];

describe("who sees whom (R9.4)", () => {
  it("counts a block in either direction", () => {
    expect(isBlockedBetween(blocks, "gunna", "jon")).toBe(true);
    expect(isBlockedBetween(blocks, "jon", "gunna")).toBe(true);
    expect(isBlockedBetween(blocks, "anna", "gunna")).toBe(true);
    expect(isBlockedBetween(blocks, "gunna", "anna")).toBe(true);
  });

  it("leaves people without a block between them alone", () => {
    expect(isBlockedBetween(blocks, "jon", "anna")).toBe(false);
    expect(isBlockedBetween([], "jon", "anna")).toBe(false);
  });

  it("hides from me everyone I blocked and everyone who blocked me", () => {
    expect(hiddenFrom(blocks, "gunna")).toEqual(new Set(["jon", "anna"]));
    expect(hiddenFrom(blocks, "jon")).toEqual(new Set(["gunna"]));
    expect(hiddenFrom(blocks, "sigga")).toEqual(new Set());
  });

  it("is symmetric for any blocks", () => {
    const person = fc.constantFrom("a", "b", "c", "d");
    fc.assert(
      fc.property(
        fc.array(fc.record({ blockerId: person, blockedId: person })),
        person,
        person,
        (some, a, b) => {
          expect(isBlockedBetween(some, a, b)).toBe(isBlockedBetween(some, b, a));
          expect(hiddenFrom(some, a).has(b)).toBe(isBlockedBetween(some, a, b) && a !== b);
        },
      ),
    );
  });
});

describe("blocking someone (3.2)", () => {
  it("refuses blocking yourself", () => {
    expect(checkBlock("jon", "jon")).toEqual({ ok: false, error: { code: "self" } });
    expect(checkBlock("jon", "gunna")).toEqual({ ok: true, value: undefined });
  });
});

describe("a trip closed to me by a block (R9.4, milestone 9 decision 2)", () => {
  const trip = { driverId: "anna", passengerIds: ["sigga", "olafur"] };

  it("closes a trip whose driver is in a block with me, either way", () => {
    expect(tripClosedTo("gunna", trip, blocks)).toBe(true);
  });

  it("closes a trip that someone in a block with me has booked", () => {
    expect(tripClosedTo("jon", { driverId: "anna", passengerIds: ["gunna"] }, blocks)).toBe(true);
    expect(tripClosedTo("gunna", { driverId: "sigga", passengerIds: ["jon"] }, blocks)).toBe(true);
  });

  it("leaves every other trip open, including my own", () => {
    expect(tripClosedTo("jon", trip, blocks)).toBe(false);
    expect(tripClosedTo("anna", trip, blocks)).toBe(false);
    expect(tripClosedTo("gunna", { driverId: "gunna", passengerIds: [] }, blocks)).toBe(false);
  });
});
