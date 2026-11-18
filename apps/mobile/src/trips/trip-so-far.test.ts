import { createTranslator } from "@shareride/i18n";
import { routeSoFar, timesSoFar } from "./trip-so-far";

const t = createTranslator("en");

describe("the rows of a trip so far (spec 18, 3.13)", () => {
  it("shows a route with an arrow and reads it out with a word", () => {
    expect(routeSoFar(t, ["Mjódd", "Hveragerði", "Selfoss"])).toEqual({
      lines: ["Mjódd → Selfoss", "1 stop on the way"],
      spoken: "Mjódd to Selfoss, 1 stop on the way",
    });
    expect(routeSoFar(t, ["Mjódd", "Selfoss"])).toEqual({
      lines: ["Mjódd → Selfoss"],
      spoken: "Mjódd to Selfoss",
    });
    expect(routeSoFar(t, ["Mjódd"])).toBeUndefined();
  });

  it("shows the day once for a trip within a day", () => {
    expect(
      timesSoFar(t, "en", [
        new Date("2026-11-15T09:00:00.000Z"),
        new Date("2026-11-15T10:00:00.000Z"),
        new Date("2026-11-15T11:00:00.000Z"),
      ]),
    ).toEqual({
      lines: ["Sunday 15 November", "09:00 → 11:00"],
      spoken: "Sunday 15 November, 09:00 to 11:00",
    });
  });

  it("names both days for a trip that ends on a later one", () => {
    expect(
      timesSoFar(t, "en", [
        new Date("2026-11-15T23:00:00.000Z"),
        new Date("2026-11-16T01:30:00.000Z"),
      ]),
    ).toEqual({
      lines: ["Sunday 15 November at 23:00", "Monday 16 November at 01:30"],
      spoken: "Sunday 15 November at 23:00 to Monday 16 November at 01:30",
    });
  });
});
