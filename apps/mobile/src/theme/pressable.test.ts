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

  it("draws a 3 wide ring 2 away for keyboard focus only", () => {
    expect(css).toContain(":focus-visible{outline:3px solid #1F5F8B !important;");
    expect(css).toContain("outline-offset:2px !important");
    expect(css).not.toMatch(/:focus\{/);
  });

  it("uses the dark focus colour in dark mode", () => {
    expect(css).toContain(
      "@media (prefers-color-scheme: dark){:focus-visible{outline-color:#8FCBE6 !important}}",
    );
  });
});
