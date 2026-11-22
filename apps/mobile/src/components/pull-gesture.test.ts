import { nextPullPhase, pulled, pullMost, pullReady, pullSlop, pullTrigger } from "./pull-gesture";

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

describe("telling a pull from a scroll on the web", () => {
  const top = (x: number, y: number) => ({ kind: "deciding", x, y }) as const;

  it("waits until the finger has moved a little", () => {
    expect(nextPullPhase(top(100, 100), { x: 103, y: 100 + pullSlop - 1 }, true)).toEqual(
      top(100, 100),
    );
  });

  it("pulls when the finger goes mostly down at the top, from where it started", () => {
    expect(nextPullPhase(top(100, 100), { x: 104, y: 100 + pullSlop }, true)).toEqual({
      kind: "pulling",
      y: 100,
    });
  });

  it("scrolls when the finger goes up, and can pull once back at the top", () => {
    const up = nextPullPhase(top(100, 100), { x: 100, y: 100 - pullSlop }, true);
    expect(up).toEqual({ kind: "waiting" });
    expect(nextPullPhase(up, { x: 100, y: 60 }, false)).toEqual({ kind: "waiting" });
    expect(nextPullPhase(up, { x: 100, y: 90 }, true)).toEqual(top(100, 90));
  });

  it("leaves a sideways swipe to the row it is on, for the whole touch", () => {
    const sideways = nextPullPhase(top(100, 100), { x: 100 + pullSlop, y: 100 + pullSlop }, true);
    expect(sideways).toEqual({ kind: "out" });
    expect(nextPullPhase(sideways, { x: 100, y: 300 }, true)).toEqual({ kind: "out" });
  });

  it("stops pulling when the finger comes back up past where it started", () => {
    const pulling = { kind: "pulling", y: 100 } as const;
    expect(nextPullPhase(pulling, { x: 100, y: 180 }, true)).toBe(pulling);
    expect(nextPullPhase(pulling, { x: 100, y: 100 }, true)).toEqual({ kind: "waiting" });
  });
});
