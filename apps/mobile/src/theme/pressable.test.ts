import { edgeStyle, focusStyle } from "./pressable";
import { colors } from "./tokens";

describe("edgeStyle", () => {
  it("draws a solid bottom edge", () => {
    expect(edgeStyle(4, "#1F4A36", false)).toEqual({
      borderBottomWidth: 4,
      borderBottomColor: "#1F4A36",
    });
  });

  it("sinks into the edge when pressed, keeping the box height", () => {
    expect(edgeStyle(4, "#1F4A36", true)).toEqual({
      borderBottomWidth: 4,
      borderBottomColor: "transparent",
      transform: [{ translateY: 4 }],
    });
  });
});

describe("focusStyle", () => {
  it("draws a 3 wide ring 2 away on the web when focused", () => {
    expect(focusStyle(true, colors.light, "web")).toEqual({
      outlineColor: "#1F5F8B",
      outlineWidth: 3,
      outlineOffset: 2,
      outlineStyle: "solid",
    });
    expect(focusStyle(true, colors.dark, "web")).toMatchObject({ outlineColor: "#8FCBE6" });
  });

  it("draws nothing when not focused", () => {
    expect(focusStyle(false, colors.light, "web")).toEqual({});
  });

  it("leaves phones their own focus highlight", () => {
    expect(focusStyle(true, colors.light, "ios")).toEqual({});
    expect(focusStyle(true, colors.light, "android")).toEqual({});
  });
});
