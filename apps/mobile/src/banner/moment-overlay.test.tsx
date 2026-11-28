import { motion } from "@/theme/tokens";
import { flyersFor, leafFall, momentOf, snowfall } from "./moment-overlay";

// What a moment brings into the scene while it plays (spec 36, 3.3 to 3.6).

const within = (value: number, [from, to]: readonly [number, number]) =>
  value >= from && value <= to;

describe("the moment of a season or a day", () => {
  it("is the season's on a plain day: snow, flying puffins, nothing, leaves", () => {
    expect(momentOf(null, "winter")).toBe("snow");
    expect(momentOf(null, "spring")).toBe("flyers");
    expect(momentOf(null, "summer")).toBeNull();
    expect(momentOf(null, "autumn")).toBe("leaves");
  });

  it("is the day's on a day, in place of its season's", () => {
    expect(momentOf("christmas", "winter")).toBe("snow");
    expect(momentOf("winterday", "autumn")).toBe("heavySnow");
    expect(momentOf("easter", "spring")).toBeNull();
    expect(momentOf("bolludagur", "winter")).toBeNull();
  });
});

describe("snow, leaves and flying puffins", () => {
  const room = [600, 900] as const;
  const ground = 120;

  it("lets snow fall in the room to near the ground, each flake in its own time", () => {
    const flakes = snowfall("snow", room, ground);
    expect(flakes.length).toBeGreaterThan(10);
    for (const flake of flakes) {
      expect(within(flake.x, room)).toBe(true);
      expect(within(flake.y + flake.dy, [ground - 22, ground + 4])).toBe(true);
      expect(within(flake.delay, motion.moments.flake.delay)).toBe(true);
      expect(within(flake.duration, motion.moments.flake.duration)).toBe(true);
    }
    // More of it on the first day of winter, and the same each time.
    expect(snowfall("heavySnow", room, ground).length).toBeGreaterThan(flakes.length);
    expect(snowfall("snow", room, ground)).toEqual(flakes);
  });

  it("never blows a flake out of the room on the words' side", () => {
    for (const kind of ["snow", "heavySnow"] as const) {
      for (const width of [240, 300, 360, 420, 480]) {
        const left = 900 - width;
        for (const flake of snowfall(kind, [left, 900], ground)) {
          expect(flake.x + flake.dx).toBeGreaterThanOrEqual(left);
        }
      }
    }
  });

  it("blows eight leaves along the room, never past its end", () => {
    const leaves = leafFall(room, ground);
    expect(leaves).toHaveLength(8);
    for (const leaf of leaves) {
      expect(within(leaf.x, room)).toBe(true);
      expect(leaf.x + leaf.dx).toBeLessThanOrEqual(room[1]);
      expect(within(leaf.delay, motion.moments.leaf.delay)).toBe(true);
      expect(within(leaf.duration, motion.moments.leaf.duration)).toBe(true);
    }
  });

  it("flies two puffins across a phone from beyond its edges, a laptop's only from its car room", () => {
    const phone = flyersFor([0, 390], 160, false);
    expect(phone).toHaveLength(2);
    for (const flyer of phone) {
      expect(flyer.x).toBeLessThan(0);
      expect(flyer.x + flyer.dx).toBeGreaterThan(390);
    }
    for (const flyer of flyersFor(room, ground, true)) {
      expect(flyer.x).toBeGreaterThanOrEqual(room[0] + 20);
    }
  });
});
