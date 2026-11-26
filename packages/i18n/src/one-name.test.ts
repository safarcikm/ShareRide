import { describe, expect, it } from "vitest";
import { en } from "./messages/en.ts";
import { is } from "./messages/is.ts";

/**
 * Texts spec 31 leaves as they are (section 10): the console, and the
 * marketing pages and About, where "a trip you are making anyway" is the
 * drive itself and not what PuffinRide lists.
 */
const leftOut = ["admin.", "seo.", "carpool.", "about."];

/** "Trip day" keeps its name (decision 5), and a placeholder is not a word. */
const saysTrip = (value: string) =>
  /\btrips?\b/i.test(value.replace(/\btrip days?\b/gi, "").replace(/\{trips?\b/g, "{"));

describe("one name each (spec 31, 3.4)", () => {
  it('says "ride" in every English text a member reads, and "trip" only in "Trip day"', () => {
    const said = Object.entries(en)
      .filter(([key]) => !leftOut.some((prefix) => key.startsWith(prefix)))
      .filter(([, value]) => saysTrip(value))
      .map(([key]) => key);
    expect(said).toEqual([]);
    expect(en["tripDay.title"]).toBe("Trip day");
  });

  it("names the three actions the same wherever they stand", () => {
    expect(en["welcome.findRide"]).toBe("Find a ride");
    expect(en["search.title"]).toBe("Find a ride");
    expect(en["search.submit"]).toBe("Find a ride");
    expect(en["driver.offerRide"]).toBe("Offer a ride");
    expect(en["trip.post"]).toBe("Offer a ride");
    expect(en["trip.publish"]).toBe("Publish ride");
    expect(en["trip.myTrips"]).toBe(en["nav.myRides"]);
  });

  it('keeps "far" for finding and offering in Icelandic, and "ferð" for the ride itself', () => {
    expect(is["welcome.findRide"]).toBe("Finna far");
    expect(is["search.title"]).toBe("Finna far");
    expect(is["search.submit"]).toBe("Finna far");
    expect(is["driver.offerRide"]).toBe("Bjóða far");
    expect(is["trip.post"]).toBe("Bjóða far");
    expect(is["trip.publish"]).toBe("Birta ferð");
    expect(is["trip.myTrips"]).toBe(is["nav.myRides"]);
  });
});
