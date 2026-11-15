import { describe, expect, it } from "vitest";
import { legsFromRoadGraph, type RoadEdge } from "../meeting-points/legs.ts";
import { checkTripForPublishing, overlaps, type TripToPublish } from "./publish.ts";
import { lookUpLegs } from "./route.ts";
import { defaultTripSettings as settings } from "./settings.ts";

const km = (value: number) => value * 1000;
const road = (from: string, to: string, distanceKm: number): RoadEdge => ({
  from,
  to,
  distanceM: km(distanceKm),
  // A minute a kilometre keeps the sums easy.
  durationS: distanceKm * 60,
});
const legs = lookUpLegs(
  legsFromRoadGraph([road("A", "B", 60), road("B", "C", 70), road("C", "D", 70)]),
);

const now = new Date("2027-03-01T08:00:00Z");
const at = (iso: string) => new Date(iso);
const allYear = { seasonStartMonth: null, seasonEndMonth: null };
const stop = (id: string) => ({ id, offered: true, season: allYear });

/** A trip that can be published: A to D tomorrow at 9, 3 seats at 100%. */
const trip: TripToPublish = {
  stops: [stop("A"), stop("B"), stop("D")],
  plannedTimes: [
    at("2027-03-02T09:00:00Z"),
    at("2027-03-02T10:00:00Z"),
    at("2027-03-02T12:20:00Z"),
  ],
  seats: 3,
  priceLevel: 100,
  note: "",
  hasCar: true,
  driverReady: true,
  otherTrips: [],
};

const check = (changes: Partial<TripToPublish>) =>
  checkTripForPublishing({ ...trip, ...changes }, legs, now, settings);

describe("checkTripForPublishing (spec 3, section 4)", () => {
  it("prices a trip with nothing to fix", () => {
    const checked = check({});
    expect(checked).toMatchObject({
      ok: true,
      value: {
        problems: [],
        warnings: [],
        departsAt: at("2027-03-02T09:00:00Z"),
        arrivesAt: at("2027-03-02T12:20:00Z"),
      },
    });
    if (!checked.ok) return;
    expect(
      checked.value.segments.map(({ from, to, distanceM, price }) => ({
        from,
        to,
        distanceM,
        price: price.amount,
      })),
    ).toEqual([
      { from: "A", to: "B", distanceM: km(60), price: 900 },
      { from: "B", to: "D", distanceM: km(140), price: 2100 },
    ]);
    expect(checked.value.segments[0]).toMatchObject({
      suggestedPrice: { amount: 900, currency: "ISK" },
      cap: { amount: 2300, currency: "ISK" },
    });
  });

  it("reports every broken rule at once", () => {
    const checked = check({
      driverReady: false,
      hasCar: false,
      stops: [stop("A"), stop("B"), stop("B")],
      plannedTimes: [
        at("2027-03-01T08:10:00Z"),
        at("2027-03-01T08:20:00Z"),
        at("2027-03-01T08:20:00Z"),
      ],
      note: "Call 555 1234",
    });
    expect(checked).toMatchObject({ ok: true });
    if (!checked.ok) return;
    expect(checked.value.problems).toEqual([
      { code: "driver_not_ready" },
      { code: "car_missing" },
      { code: "stop_repeated", stop: 2 },
      { code: "departure_too_soon" },
      { code: "stretch_too_fast", segment: 0 },
      { code: "times_not_increasing", segment: 1 },
      { code: "note_has_contact_details", kinds: ["phone"] },
    ]);
  });

  it("refuses a price level above the highest for the seats, without lowering it", () => {
    // 8 seats allow 110% at most.
    expect(check({ seats: 8, priceLevel: 120 })).toMatchObject({
      ok: true,
      value: { problems: [{ code: "price_level_invalid" }], segments: [] },
    });
    expect(check({ priceLevel: 85 })).toMatchObject({
      value: { problems: [{ code: "price_level_invalid" }] },
    });
    expect(check({ seats: 9 })).toMatchObject({
      value: { problems: [{ code: "seats_invalid" }], segments: [] },
    });
  });

  it("needs the times, and every stop in use and in season", () => {
    expect(check({ plannedTimes: null })).toMatchObject({
      value: { problems: [{ code: "times_missing" }] },
    });
    const summer = { seasonStartMonth: 6, seasonEndMonth: 9 };
    expect(
      check({ stops: [stop("A"), { ...stop("B"), season: summer }, stop("D")] }),
    ).toMatchObject({
      value: { problems: [{ code: "stop_out_of_season", stop: 1 }] },
    });
    // A paused point: the route is not checked, since its legs may be gone.
    expect(
      check({ stops: [stop("A"), { ...stop("unknown"), offered: false }, stop("D")] }),
    ).toEqual({
      ok: true,
      value: {
        problems: [{ code: "stop_unavailable", stop: 1 }],
        warnings: [],
        segments: [],
        departsAt: at("2027-03-02T09:00:00Z"),
        arrivesAt: at("2027-03-02T12:20:00Z"),
      },
    });
  });

  it("with a paused point, still lists the problems that need no distances", () => {
    const checked = check({
      stops: [stop("A"), { ...stop("unknown"), offered: false }, stop("D")],
      plannedTimes: [
        at("2027-03-01T08:10:00Z"),
        at("2027-03-01T09:00:00Z"),
        at("2027-03-01T11:00:00Z"),
      ],
      note: "Call 555 1234",
      otherTrips: [
        { departsAt: at("2027-03-01T10:00:00Z"), arrivesAt: at("2027-03-01T12:00:00Z") },
      ],
    });
    expect(checked).toMatchObject({
      ok: true,
      value: {
        problems: [
          { code: "stop_unavailable", stop: 1 },
          { code: "departure_too_soon" },
          { code: "overlaps_trip" },
          { code: "note_has_contact_details", kinds: ["phone"] },
        ],
        segments: [],
      },
    });
    expect(
      check({
        stops: [stop("A"), { ...stop("B"), offered: false }, stop("D")],
        plannedTimes: null,
      }),
    ).toMatchObject({
      value: { problems: [{ code: "stop_unavailable", stop: 1 }, { code: "times_missing" }] },
    });
  });

  it("refuses a trip that overlaps another of the driver's trips", () => {
    const morning = {
      departsAt: at("2027-03-02T07:00:00Z"),
      arrivesAt: at("2027-03-02T09:30:00Z"),
    };
    const evening = {
      departsAt: at("2027-03-02T12:20:00Z"),
      arrivesAt: at("2027-03-02T15:00:00Z"),
    };
    expect(check({ otherTrips: [morning] })).toMatchObject({
      value: { problems: [{ code: "overlaps_trip" }] },
    });
    // Arriving as the next trip leaves is not an overlap.
    expect(check({ otherTrips: [evening] })).toMatchObject({ value: { problems: [] } });
  });

  it("passes on the route and time warnings", () => {
    const checked = check({
      plannedTimes: [
        at("2027-03-02T09:00:00Z"),
        at("2027-03-02T12:30:00Z"),
        at("2027-03-02T14:50:00Z"),
      ],
    });
    expect(checked).toMatchObject({
      value: { problems: [], warnings: [{ code: "long_break", segment: 0 }] },
    });
  });

  it("needs the distances", () => {
    expect(check({ stops: [stop("A"), stop("new"), stop("D")] })).toMatchObject({
      ok: false,
      error: { code: "distances_missing" },
    });
  });
});

describe("overlaps (R3.7)", () => {
  const window = (from: string, to: string) => ({ departsAt: at(from), arrivesAt: at(to) });

  it("is true only when the two share some time", () => {
    const trip = window("2027-03-02T09:00:00Z", "2027-03-02T12:00:00Z");
    expect(overlaps(trip, window("2027-03-02T11:00:00Z", "2027-03-02T13:00:00Z"))).toBe(true);
    expect(overlaps(trip, window("2027-03-02T10:00:00Z", "2027-03-02T11:00:00Z"))).toBe(true);
    expect(overlaps(trip, window("2027-03-02T12:00:00Z", "2027-03-02T13:00:00Z"))).toBe(false);
    expect(overlaps(trip, window("2027-03-02T07:00:00Z", "2027-03-02T09:00:00Z"))).toBe(false);
  });
});
