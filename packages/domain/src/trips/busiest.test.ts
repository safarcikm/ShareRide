import { describe, expect, it } from "vitest";
import { busiestStretch } from "./busiest.ts";

// "2 of 3 seats taken from Mjódd to Selfoss" (spec 31, 3.12): the fullest
// run of stretches, named by the stops at its two ends.
describe("busiestStretch", () => {
  it("is the one stretch of a ride with no stop on the way", () => {
    expect(busiestStretch([2])).toEqual({ taken: 2, from: 0, to: 1 });
  });

  it("is the stretch that holds the most", () => {
    expect(busiestStretch([1, 3, 2])).toEqual({ taken: 3, from: 1, to: 2 });
  });

  it("is a whole run of neighbours that hold the most", () => {
    expect(busiestStretch([1, 2, 2, 2, 0])).toEqual({ taken: 2, from: 1, to: 4 });
    expect(busiestStretch([2, 2, 2])).toEqual({ taken: 2, from: 0, to: 3 });
  });

  it("is the first run when two are as full", () => {
    expect(busiestStretch([2, 1, 2, 2])).toEqual({ taken: 2, from: 0, to: 1 });
  });

  it("is the whole ride when nobody has a seat", () => {
    expect(busiestStretch([0, 0, 0])).toEqual({ taken: 0, from: 0, to: 3 });
  });

  it("looks only between two stops when asked, and names them by the ride's stops", () => {
    // A passenger from stop 1 to stop 3 of a ride whose first stretch is fullest.
    expect(busiestStretch([3, 1, 2, 3], 1, 3)).toEqual({ taken: 2, from: 2, to: 3 });
    expect(busiestStretch([3, 1, 1, 3], 1, 3)).toEqual({ taken: 1, from: 1, to: 3 });
  });

  it("is nothing without a stretch", () => {
    expect(busiestStretch([])).toBeNull();
    expect(busiestStretch([1, 2], 1, 1)).toBeNull();
    expect(busiestStretch([1, 2], 2, 1)).toBeNull();
  });

  it("keeps to the ride when asked for stops beyond it", () => {
    expect(busiestStretch([1, 2], -3, 9)).toEqual({ taken: 2, from: 1, to: 2 });
  });
});
