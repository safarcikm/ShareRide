import type { MyTrip } from "@shareride/contracts";
import { createTranslator } from "@shareride/i18n";
import { northMyTrip } from "@/testing/bookings";
import { driverTitle } from "./title";

// Spec 31, 3.12 item 1: the driver's ride is "Your ride to Vík", and the
// line under it says what it needs, or else how it stands.

const en = createTranslator("en");
const is = createTranslator("is");
/** Saturday 14 November 2026, noon in Iceland: the day before the north trip. */
const noon = new Date("2026-11-14T12:00:00Z");

const title = (trip: MyTrip, requests = 0, at = noon) => driverTitle(en, "en", trip, requests, at);

describe("the title of a ride I drive", () => {
  it("names where the ride ends, and in Icelandic both ends with an arrow", () => {
    expect(title(northMyTrip).title).toBe("Your ride to Hof, Akureyri");
    expect(driverTitle(is, "is", northMyTrip, 0, noon).title).toBe(
      "Ferðin þín: BSÍ umferðarmiðstöð → Hof, Akureyri",
    );
  });

  it("says how many requests need an answer", () => {
    expect(title(northMyTrip, 1).line).toBe("1 request needs your answer.");
    expect(title(northMyTrip, 2).line).toBe("2 requests need your answer.");
    expect(driverTitle(is, "is", northMyTrip, 1, noon).line).toBe("1 beiðni bíður svars.");
    expect(driverTitle(is, "is", northMyTrip, 2, noon).line).toBe("2 beiðnir bíða svars.");
  });

  it("says the day and the time while nothing is asked of the driver", () => {
    expect(title(northMyTrip).line).toBe("Sunday 15 November at 09:00");
  });

  it("has no line for a ride without a time, rather than an empty one", () => {
    expect(title({ ...northMyTrip, departsAt: null }).line).toBeUndefined();
  });

  it("says when and where from on the trip day", () => {
    const today: MyTrip = { ...northMyTrip, phase: "trip_day" };
    expect(title(today, 0, new Date("2026-11-15T07:00:00Z")).line).toBe(
      "Today at 09:00 from BSÍ bus terminal.",
    );
    // A ride that leaves after midnight, opened the evening before.
    expect(title(today, 0, new Date("2026-11-14T23:00:00Z")).line).toBe(
      "At 09:00 from BSÍ bus terminal.",
    );
    // A request still to answer comes first.
    expect(title(today, 1, new Date("2026-11-15T07:00:00Z")).line).toBe(
      "1 request needs your answer.",
    );
  });

  it("says a ride has left once its time has come and the trip day is over", () => {
    const left: MyTrip = { ...northMyTrip, status: "completed", phase: "completed" };
    expect(title(left, 0, new Date("2026-11-16T12:00:00Z")).line).toBe("This ride has left.");
  });

  it("says a cancelled ride was cancelled, and why when the driver did it", () => {
    expect(title({ ...northMyTrip, status: "cancelled", cancellation: null }).line).toBe(
      "This ride was cancelled.",
    );
    expect(
      title({
        ...northMyTrip,
        status: "cancelled",
        cancellation: { reason: "car_problem", note: "", countsOnReliability: false },
      }).line,
    ).toBe("You cancelled this ride: Car problem");
  });
});
