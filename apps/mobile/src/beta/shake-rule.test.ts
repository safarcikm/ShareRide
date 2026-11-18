import { createShakeDetector } from "./shake-rule";

const rest = { x: 0, y: 0, z: 1 };
const swing = { x: 2, y: 1.5, z: 0.5 };

describe("the shake detector", () => {
  it("takes three swings within a second for a shake", () => {
    const detector = createShakeDetector();
    expect(detector.reading(swing, 0)).toBe(false);
    expect(detector.reading(rest, 100)).toBe(false);
    expect(detector.reading(swing, 300)).toBe(false);
    expect(detector.reading(swing, 900)).toBe(true);
  });

  it("does not take a bump, or swings far apart, for one", () => {
    const detector = createShakeDetector();
    expect(detector.reading(swing, 0)).toBe(false);
    expect(detector.reading(swing, 800)).toBe(false);
    expect(detector.reading(swing, 1900)).toBe(false);
    expect(detector.reading(rest, 2000)).toBe(false);
  });

  it("rests 3 seconds after a shake, so one shake opens one form", () => {
    const detector = createShakeDetector();
    const shake = (from: number) =>
      [0, 100, 200].map((after) => detector.reading(swing, from + after)).some(Boolean);
    expect(shake(0)).toBe(true);
    expect(shake(1000)).toBe(false);
    expect(shake(2900)).toBe(false);
    expect(shake(3300)).toBe(true);
  });
});
