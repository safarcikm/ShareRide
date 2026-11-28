import { momentParts, motionCss } from "./motion-css";
import { motion, spacing } from "./tokens";

describe("motionCss (spec 33, 3.2)", () => {
  const css = motionCss();
  const { arrival, curves } = motion;

  it("drives the arriving car in from where --from says, slowing to a stop", () => {
    expect(css).toContain(
      `[data-motion="arrive"]{animation:pr-arrive ${String(arrival.drive)}ms ${curves.brake} both}`,
    );
    expect(css).toContain(
      "@keyframes pr-arrive{from{transform:translateX(var(--from))}to{transform:none}}",
    );
  });

  it("bobs the car's body on the road, then dips its nose as it stops", () => {
    expect(css).toContain(
      `[data-motion="arrive"] [data-motion="car-body"]{transform-box:fill-box;` +
        `transform-origin:50% 92%;animation:pr-settle ${String(arrival.settle)}ms linear both}`,
    );
    const settle = /@keyframes pr-settle\{(.*?)\}\}/.exec(css)?.[1] ?? "";
    expect(settle).toContain("translateY(-1.6px)");
    expect(settle).toContain("rotate(2.6deg)");
    expect(settle).toMatch(/100%\{transform:none$/);
  });

  it("hops the passenger, then the driver, once the car has stopped", () => {
    const [you, driver] = arrival.hops;
    expect(css).toContain(
      `[data-motion="arrive"] [data-motion="puffin-you"]{animation:pr-hop ${String(arrival.hop)}ms ${String(you)}ms both}`,
    );
    expect(css).toContain(
      `[data-motion="arrive"] [data-motion="puffin-driver"]{animation:pr-hop ${String(arrival.hop)}ms ${String(driver)}ms both}`,
    );
    expect(css).toContain("@keyframes pr-hop{");
  });

  it("on a laptop, keeps the car to its own room beside the title, coming out of its edge", () => {
    expect(css).toContain(
      `[data-motion="arrive-room"]{overflow:hidden;` +
        `-webkit-mask-image:linear-gradient(to right,transparent,#000 ${String(spacing.lg)}px);` +
        `mask-image:linear-gradient(to right,transparent,#000 ${String(spacing.lg)}px)}`,
    );
    expect(css).toContain(
      '[data-motion="arrive-room"] [data-motion="arrive"]{animation-name:pr-arrive-fade}',
    );
    expect(css).toContain("@keyframes pr-arrive-fade{");
  });

  it("animates only where things are and how see-through they are (R33.2)", () => {
    const frames = [...css.matchAll(/@keyframes [\w-]+\{(.*?)\}\}/g)].map((m) => m[1] ?? "");
    expect(frames).toHaveLength(4 + momentParts.length);
    const properties = new Set(
      frames.flatMap((body) => [...body.matchAll(/([a-z-]+):/g)].map((m) => m[1])),
    );
    expect([...properties].sort()).toEqual(["animation-timing-function", "opacity", "transform"]);
  });

  it("has a rule and its own keyframes for every part of a moment (spec 36, 3.6)", () => {
    expect(momentParts).toEqual(
      expect.arrayContaining(["flake", "leaf", "flyer", "aurora", "sunrise", "burst", "bulb"]),
    );
    for (const part of momentParts) {
      // While the car arrives, or in the scene of the moment that plays.
      expect(css).toContain(`[data-motion="arrive"] [data-motion="${part}"],`);
      expect(css).toContain(`[data-motion="moment"] [data-motion="${part}"]{`);
      expect(css).toContain(`animation:pr-${part} `);
      expect(css).toContain(`@keyframes pr-${part}{`);
    }
  });

  it("times each moment as the tokens say, or as each drawn thing says", () => {
    const { aurora, sunrise, flake } = motion.moments;
    expect(css).toContain(`animation:pr-aurora ${String(aurora.duration)}ms `);
    expect(css).toContain(
      `animation:pr-sunrise ${String(sunrise.duration)}ms ${String(sunrise.delay)}ms `,
    );
    // Snow falls as long and as late as each flake is told, with a default.
    expect(css).toContain(
      `animation:pr-flake var(--t,${String(flake.duration[1])}ms) var(--d,0ms) linear both`,
    );
  });

  it("plays each moment once: nothing goes on for ever (R33.3)", () => {
    expect(css).not.toContain("infinite");
  });

  it("keeps snow, leaves, trails and flying puffins unseen until their moment shows them", () => {
    for (const part of ["flake", "leaf", "trail", "flyer"]) {
      expect(css).toMatch(new RegExp(`\\[data-motion="${part}"\\][^{]*\\{opacity:0\\}`));
    }
  });

  it("stops everything for someone who asked for less motion (R33.4)", () => {
    expect(css).toContain(
      "@media (prefers-reduced-motion: reduce){[data-motion]{animation:none !important;" +
        "-webkit-mask-image:none !important;mask-image:none !important}}",
    );
    // Last, so it wins over every rule before it.
    expect(css.endsWith("}}")).toBe(true);
    expect(css.lastIndexOf("@media")).toBeGreaterThan(css.lastIndexOf("@keyframes"));
  });
});
