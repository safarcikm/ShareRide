import { chunky, focusRingCss } from "./pressable";
import { colors } from "./tokens";

describe("chunky", () => {
  it("draws a solid bottom edge under the face", () => {
    expect(chunky(4, "#1F4A36", false)).toEqual({
      outer: { borderBottomWidth: 4, borderBottomColor: "#1F4A36" },
      face: {},
    });
  });

  it("sinks the face into the edge when pressed, keeping the box height", () => {
    expect(chunky(4, "#1F4A36", true)).toEqual({
      outer: { borderBottomWidth: 4, borderBottomColor: "#1F4A36" },
      face: { transform: [{ translateY: 4 }] },
    });
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

  it("leaves text fields to show focus with their own outline", () => {
    expect(css).toContain("input:focus,textarea:focus{outline:none !important}");
  });

  it("uses the dark focus colour in dark mode", () => {
    expect(css).toContain(
      `@media (prefers-color-scheme: dark){${ring}{outline-color:#8FCBE6 !important}}`,
    );
  });
});
