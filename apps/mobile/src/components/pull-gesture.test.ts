import { pulled, pullMost, pullReady, pullTrigger } from "./pull-gesture";

describe("pulling down to refresh (spec 16, 3.9)", () => {
  it("follows the finger at half its pace, from the top", () => {
    expect(pulled(0)).toBe(0);
    expect(pulled(-30)).toBe(0);
    expect(pulled(40)).toBe(20);
    expect(pulled(pullTrigger * 2)).toBe(pullTrigger);
  });

  it("stops at its furthest", () => {
    expect(pulled(1000)).toBe(pullMost);
    expect(pullMost).toBeGreaterThan(pullTrigger);
  });

  it("refreshes only once pulled far enough", () => {
    expect(pullReady(pullTrigger - 1)).toBe(false);
    expect(pullReady(pullTrigger)).toBe(true);
    expect(pullReady(pullMost)).toBe(true);
  });
});
