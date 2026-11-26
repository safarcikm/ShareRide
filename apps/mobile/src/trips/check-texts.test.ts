import { createTranslator } from "@shareride/i18n";
import { routeChecked, timeChecked } from "./check-texts";

const en = createTranslator("en");
const is = createTranslator("is");

describe("the Route and Time rows of Check and publish (spec 31, 3.11)", () => {
  it("says the two ends with the stops between them counted", () => {
    expect(routeChecked(en, ["Mjódd", "Hveragerði", "Hella", "Vík"])).toEqual({
      lines: ["Mjódd to Vík, with 2 stops on the way"],
      spoken: "Mjódd to Vík, with 2 stops on the way",
    });
    expect(routeChecked(en, ["Mjódd", "Selfoss"])).toEqual({
      lines: ["Mjódd to Selfoss"],
      spoken: "Mjódd to Selfoss",
    });
  });

  it("shows an arrow in Icelandic, where a name after “til” would stand in the wrong case", () => {
    // Read out, the arrow is the word, as on every other screen.
    expect(routeChecked(is, ["Mjódd", "Hveragerði", "Hella", "N1 Selfossi"])).toEqual({
      lines: ["Mjódd → N1 Selfossi, með 2 viðkomustöðum á leiðinni"],
      spoken: "Mjódd til N1 Selfossi, með 2 viðkomustöðum á leiðinni",
    });
    expect(routeChecked(is, ["Mjódd", "Hveragerði", "N1 Selfossi"]).lines).toEqual([
      "Mjódd → N1 Selfossi, með 1 viðkomustað á leiðinni",
    ]);
  });

  const withinADay = [new Date("2026-11-15T09:00:00.000Z"), new Date("2026-11-15T11:00:00.000Z")];
  const overMidnight = [new Date("2026-11-15T23:00:00.000Z"), new Date("2026-11-16T01:00:00.000Z")];

  it("says the day once, with the two times, in one line", () => {
    expect(timeChecked(en, "en", withinADay)).toEqual({
      lines: ["Sunday 15 November, 09:00 to 11:00"],
      spoken: "Sunday 15 November, 09:00 to 11:00",
    });
    expect(timeChecked(is, "is", withinADay)?.lines).toEqual([
      "Sunnudagur 15. nóvember, 09:00 til 11:00",
    ]);
  });

  it("gives each day a line of its own when the ride ends on a later one", () => {
    expect(timeChecked(en, "en", overMidnight)).toEqual({
      lines: ["Sunday 15 November at 23:00", "Monday 16 November at 01:00"],
      spoken: "Sunday 15 November at 23:00 to Monday 16 November at 01:00",
    });
    // No day stands after “til” on screen, where it would need another case.
    expect(timeChecked(is, "is", overMidnight)?.lines).toEqual([
      "Sunnudagur 15. nóvember kl. 23:00",
      "Mánudagur 16. nóvember kl. 01:00",
    ]);
  });

  it("has no time for a ride with none yet", () => {
    expect(timeChecked(en, "en", [])).toBeUndefined();
  });
});
