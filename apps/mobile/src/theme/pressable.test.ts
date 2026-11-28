import { cardLift, cardRing, chunky, drawsBoxShadows, focusRingCss } from "./pressable";
import { colors, depth } from "./tokens";

describe("chunky", () => {
  it("draws the edge as a second face under the face, as thick at the corners", () => {
    expect(chunky(4, "#1F4A36", false, true)).toEqual({
      outer: { paddingBottom: 4 },
      face: { boxShadow: "0px 4px 0px #1F4A36" },
    });
  });

  it("sinks the face over the edge when pressed, keeping the box height", () => {
    expect(chunky(4, "#1F4A36", true, true)).toEqual({
      outer: { paddingBottom: 4 },
      face: { transform: [{ translateY: 4 }] },
    });
  });

  it("draws nothing for a part with no edge", () => {
    expect(chunky(0, "transparent", false, true)).toEqual({ outer: {}, face: {} });
  });

  it("keeps a solid bottom border where no box shadows are drawn", () => {
    expect(chunky(3, "#D2DDE1", false, false)).toEqual({
      outer: { borderBottomWidth: 3, borderBottomColor: "#D2DDE1" },
      face: {},
    });
    expect(chunky(3, "#D2DDE1", true, false).face).toEqual({ transform: [{ translateY: 3 }] });
  });
});

describe("cardRing", () => {
  it("is a hairline in the ring's colour, or twice as thick in a colour of its own", () => {
    expect(cardRing("light", undefined, true)).toEqual({ color: depth.light.ring, width: 1 });
    expect(cardRing("dark", undefined, true)).toEqual({ color: depth.dark.ring, width: 1 });
    expect(cardRing("light", colors.light.primary, true)).toEqual({
      color: colors.light.primary,
      width: 2,
    });
  });

  it("is not there on Android before 9 unless it has a colour of its own", () => {
    expect(cardRing("light", undefined, false).width).toBe(0);
    expect(cardRing("light", colors.light.primary, false).width).toBe(2);
  });
});

describe("cardLift", () => {
  it("rings a card with a hairline and puts a soft shadow under it by day", () => {
    expect(cardLift("light", {}, true)).toEqual({
      outer: {},
      face: { boxShadow: `0px 0px 0px 1px ${depth.light.ring}, ${depth.light.shadow}` },
    });
  });

  it("adds a light line along the top at night", () => {
    expect(cardLift("dark", {}, true).face.boxShadow).toBe(
      `${depth.dark.highlight}, 0px 0px 0px 1px ${depth.dark.ring}, ${depth.dark.shadow}`,
    );
  });

  it("draws a ring of its own colour twice as thick", () => {
    expect(cardLift("light", { ring: colors.light.primary }, true).face.boxShadow).toBe(
      `0px 0px 0px 2px ${colors.light.primary}, ${depth.light.shadow}`,
    );
  });

  it("sinks a little when pressed and keeps only the near shadow", () => {
    expect(cardLift("light", { pressed: true }, true).face).toEqual({
      boxShadow: `0px 0px 0px 1px ${depth.light.ring}, ${depth.light.pressed}`,
      transform: [{ translateY: 1 }],
    });
  });

  it("keeps every layer soft: no layer darker than 8% by day", () => {
    const alphas = [...`${depth.light.shadow}, ${depth.light.pressed}`.matchAll(/, ([\d.]+)\)/g)];
    expect(alphas.length).toBeGreaterThan(0);
    for (const [, alpha] of alphas) expect(Number(alpha)).toBeLessThan(0.08);
  });

  it("uses the system's own shadow where no box shadows are drawn", () => {
    expect(cardLift("light", {}, false).face).toEqual({ elevation: 2 });
    expect(cardLift("light", { ring: "#F4C04E", pressed: true }, false).face).toEqual({
      elevation: 1,
      borderWidth: 2,
      borderColor: "#F4C04E",
      transform: [{ translateY: 1 }],
    });
  });
});

describe("drawsBoxShadows", () => {
  it("is false only on Android before 9", () => {
    expect(drawsBoxShadows("ios", "26.1")).toBe(true);
    expect(drawsBoxShadows("web", 0)).toBe(true);
    expect(drawsBoxShadows("android", 28)).toBe(true);
    expect(drawsBoxShadows("android", 27)).toBe(false);
  });
});

describe("focusRingCss", () => {
  const css = focusRingCss(colors.light, colors.dark);
  const ring = ":focus-visible:not(input):not(textarea)";

  it("draws a 3 wide ring 2 away for keyboard focus only", () => {
    expect(css).toContain(`${ring}{outline:3px solid #1F5F8B !important;`);
    expect(css).toContain("outline-offset:2px !important");
    // The only rule for plain :focus turns the outline off (on fields).
    expect(css.match(/:focus\{[^}]*\}/g)).toEqual([":focus{outline:none !important}"]);
  });

  it("draws the ring inside a part that asks for it, such as a row in a card of rows", () => {
    expect(css).toContain(`[data-ring="inside"]${ring}{outline-offset:-3px !important}`);
    // After the rule for every part, so it wins.
    expect(css.indexOf('[data-ring="inside"]')).toBeGreaterThan(
      css.indexOf("outline-offset:2px !important"),
    );
  });

  it("leaves text fields to show focus with their own outline", () => {
    expect(css).toContain("input:focus,textarea:focus{outline:none !important}");
  });

  it("uses the dark focus colour in dark mode", () => {
    expect(css).toContain(
      `@media (prefers-color-scheme: dark){${ring}{outline-color:#8FCBE6 !important}}`,
    );
  });
});
