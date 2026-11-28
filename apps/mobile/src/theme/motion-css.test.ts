import { motionCss } from "./motion-css";
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
    expect(frames).toHaveLength(4);
    const properties = new Set(
      frames.flatMap((body) => [...body.matchAll(/([a-z-]+):/g)].map((m) => m[1])),
    );
    expect([...properties].sort()).toEqual(["animation-timing-function", "opacity", "transform"]);
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
