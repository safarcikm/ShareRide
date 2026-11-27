import { describe, expect, it } from "vitest";
import type { TripDetailsService } from "./details.ts";
import { rideCard, rideFinder, rideOf, type RideSource } from "./link-preview.ts";

const id = "6f1c2f9e-3b1a-4c7d-9e2f-0a1b2c3d4e5f";

const stop = (is: string, en: string, plannedAt: string) => ({
  meetingPoint: { name: { is, en } },
  plannedAt,
});

/** Reykjavík to Akureyri on Friday 27 November 2026, by Borgarnes and Blönduós. */
function trip(
  state: RideSource["part"]["state"] = "open",
  board = 0,
  alight = 3,
  departs = "2026-11-27T09:00:00.000Z",
): RideSource {
  return {
    id,
    stops: [
      stop("Reykjavík – BSÍ", "Reykjavík – BSÍ bus terminal", departs),
      stop("Borgarnes – N1", "Borgarnes – N1", "2026-11-27T10:10:00.000Z"),
      stop("Blönduós – N1", "Blönduós – N1", "2026-11-27T12:05:00.000Z"),
      stop("Akureyri – Hof", "Akureyri – Hof", "2026-11-27T13:30:00.000Z"),
    ],
    part: { board, alight, state },
  };
}

describe("which shared rides get a card of their own (spec 23, 3.10, item 1)", () => {
  it("gives a part that has not left a card, whether seats are free or not", () => {
    for (const state of ["open", "full", "closed"] as const) {
      expect(rideOf(trip(state))).toBeDefined();
    }
  });

  it("leaves a cancelled or departed part to the general preview", () => {
    for (const state of ["cancelled", "departed", "own"] as const) {
      expect(rideOf(trip(state))).toBeUndefined();
    }
  });

  it("keeps the part's stops only, from boarding to getting out", () => {
    const ride = rideOf(trip("open", 1, 3));
    expect(ride?.stops.map((one) => one.name.en)).toEqual([
      "Borgarnes – N1",
      "Blönduós – N1",
      "Akureyri – Hof",
    ]);
    expect(ride).toMatchObject({ id, board: 1, alight: 3 });
  });

  it("says seats are free only while the part can be booked", () => {
    expect(rideOf(trip("open"))?.bookable).toBe(true);
    expect(rideOf(trip("full"))?.bookable).toBe(false);
    expect(rideOf(trip("closed"))?.bookable).toBe(false);
  });
});

/** The ride of a trip that has one. */
function rideFrom(source: RideSource) {
  const ride = rideOf(source);
  if (ride === undefined) throw new Error("no ride");
  return ride;
}

describe("what a ride's card says (spec 23, 3.10, item 2)", () => {
  const ride = rideFrom(trip());

  it("names the route and when it leaves, in the reader's language", () => {
    expect(rideCard(ride, "en").title).toBe(
      "Reykjavík – BSÍ bus terminal → Akureyri – Hof · Fri 27 Nov at 09:00",
    );
    expect(rideCard(ride, "is").title).toBe(
      "Reykjavík – BSÍ → Akureyri – Hof · fös. 27. nóv. kl. 09:00",
    );
  });

  it("says what PuffinRide is, and nothing about money", () => {
    expect(rideCard(ride, "en").description).toBe(
      "A shared ride on PuffinRide, carpooling across Iceland. See the ride and book a seat.",
    );
    expect(rideCard(ride, "is").description).toBe(
      "Far á PuffinRide, samferða um Ísland. Sjáðu ferðina og bókaðu sæti.",
    );
  });

  it("describes the picture for screen readers", () => {
    expect(rideCard(ride, "en").imageAlt).toBe(
      "Reykjavík – BSÍ bus terminal → Akureyri – Hof, Friday 27 November at 09:00, on PuffinRide",
    );
    expect(rideCard(ride, "is").imageAlt).toBe(
      "Reykjavík – BSÍ → Akureyri – Hof, föstudagur 27. nóvember kl. 09:00, á PuffinRide",
    );
  });

  it("points at the part's picture in the reader's language", () => {
    const path = rideCard(ride, "is").imagePath;
    expect(path).toMatch(
      new RegExp(`^/v1/trips/${id}/preview\\.png\\?fromStop=0&toStop=3&lang=is&v=[0-9a-f]{12}$`),
    );
  });

  it("gives the picture a new address when what it shows changes (item 4)", () => {
    const now = rideCard(ride, "en").imagePath;
    expect(rideCard(rideFrom(trip()), "en").imagePath).toBe(now);
    const moved = rideFrom(trip("open", 0, 3, "2026-11-27T10:00:00.000Z"));
    expect(rideCard(moved, "en").imagePath).not.toBe(now);
    expect(rideCard(rideFrom(trip("full")), "en").imagePath).not.toBe(now);
    const later = trip();
    const renamed = {
      ...later,
      stops: later.stops.map((one, index) =>
        index === 1 ? stop("Borgarnes – Olís", "Borgarnes – Olís", one.plannedAt) : one,
      ),
    };
    expect(rideCard(rideFrom(renamed), "en").imagePath).not.toBe(now);
  });
});

describe("finding a trip page's ride (spec 23, 3.10, item 1)", () => {
  it("keeps the general card when the trip cannot be read just now", async () => {
    const failed = new Error("connection lost");
    const details = {
      details: () => Promise.reject(failed),
    } as unknown as TripDetailsService;
    const errors: unknown[] = [];
    const find = rideFinder(details, (error) => errors.push(error));
    expect(await find(`/trips/${id}`, () => undefined)).toBeUndefined();
    expect(errors).toEqual([failed]);
  });
});
