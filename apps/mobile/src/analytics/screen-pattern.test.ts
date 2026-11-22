import { screenPattern } from "./screen-pattern";

// What Google Analytics is told about a screen (spec 23, 3.3, item 1): its
// pattern, never its address.
describe("a screen's pattern", () => {
  it("is the route's file path, with its brackets and without groups or index", () => {
    expect(screenPattern(["(tabs)"])).toBe("/");
    expect(screenPattern(["(tabs)", "my-rides"])).toBe("/my-rides");
    expect(screenPattern(["trips", "[id]"])).toBe("/trips/[id]");
    expect(screenPattern(["meeting-points", "[id]", "index"])).toBe("/meeting-points/[id]");
    expect(screenPattern(["legal", "[type]"])).toBe("/legal/[type]");
    expect(screenPattern([])).toBe("/");
  });
});
