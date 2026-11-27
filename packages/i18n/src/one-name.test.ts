import { describe, expect, it } from "vitest";
import { en } from "./messages/en.ts";
import { is } from "./messages/is.ts";

/**
 * Texts spec 31 leaves as they are (section 10): the console's own, and
 * three on the marketing pages and About where "a trip you are making
 * anyway" is the drive itself and not what PuffinRide lists.
 */
const ofTheConsole = "admin.";
const theDriveItself = ["seo.findDescription", "carpool.taxiAnswer", "about.intro"];
/** As plain strings: a text is compared with words it must no longer be. */
const forMembers: readonly (readonly [string, string])[] = Object.entries(en).filter(
  ([key]) => !key.startsWith(ofTheConsole) && !theDriveItself.includes(key),
);

/** "Trip day" keeps its name (decision 5), and a placeholder is not a word. */
const saysTrip = (value: string) =>
  /\btrips?\b/i.test(value.replace(/\btrip days?\b/gi, "").replace(/\{trips?\b/g, "{"));

describe("one name each (spec 31, 3.4)", () => {
  it('says "ride" in every English text a member reads, and "trip" only in "Trip day"', () => {
    const said = forMembers.filter(([, value]) => saysTrip(value)).map(([key]) => key);
    expect(said).toEqual([]);
    expect(en["tripDay.title"]).toBe("Trip day");
    // The three that keep the word still say it, or they need no exception.
    for (const key of theDriveItself) expect(saysTrip(en[key as keyof typeof en])).toBe(true);
  });

  it("has no button named Search, and posts no ride or trip", () => {
    const old = forMembers
      .filter(
        ([, value]) => value === "Search" || /\bpost (a|your|new) (ride|trip)s?\b/i.test(value),
      )
      .map(([key]) => key);
    expect(old).toEqual([]);
  });

  it("names the three actions the same wherever they stand", () => {
    expect(en["welcome.findRide"]).toBe("Find a ride");
    expect(en["search.title"]).toBe("Find a ride");
    expect(en["driver.offerRide"]).toBe("Offer a ride");
    expect(en["trip.publish"]).toBe("Publish ride");
  });

  it('keeps "far" for finding and offering in Icelandic, and "ferð" for the ride itself', () => {
    expect(is["welcome.findRide"]).toBe("Finna far");
    expect(is["search.title"]).toBe("Finna far");
    expect(is["driver.offerRide"]).toBe("Bjóða far");
    expect(is["trip.publish"]).toBe("Birta ferð");
  });
});
