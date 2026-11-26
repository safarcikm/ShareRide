// Search results as the API returns them, and a fake search API, for screen
// tests. Not used by the app itself.
import type { TripDetails, TripSearchResult } from "@shareride/contracts";
import { failure, ok, type FakeClient } from "./fake-client";
import { bsi, hof, thorlakshofn } from "./meeting-points";
import { blonduos, borgarnes, tripPoints } from "./trips";
import { newcomer } from "./people";

/** Reykjavík to Akureyri on Sunday 15 November, for Borgarnes to Blönduós. */
export const northResult: TripSearchResult = {
  tripId: "0190a1d6-0000-7000-8000-0000000000d1",
  board: {
    position: 1,
    meetingPoint: borgarnes,
    plannedAt: "2026-11-15T10:00:00.000Z",
    nearbyM: null,
  },
  alight: {
    position: 2,
    meetingPoint: blonduos,
    plannedAt: "2026-11-15T12:05:00.000Z",
    nearbyM: null,
  },
  tripFrom: bsi.name,
  tripTo: hof.name,
  pricePerSeat: { amount: 2900, currency: "ISK" },
  total: { amount: 2900, currency: "ISK" },
  freeSeats: 3,
  driver: { firstName: "Anna", rating: newcomer.rating, photo: null, colour: 1 },
  bookingMode: "approval",
};

/** The same trip on another day, a minute apart for each day later. */
export function resultOn(date: string, changes: Partial<TripSearchResult> = {}): TripSearchResult {
  return {
    ...northResult,
    tripId: `0190a1d6-0000-7000-8000-0000000${date.replaceAll("-", "").slice(3)}`,
    board: { ...northResult.board, plannedAt: `${date}T10:00:00.000Z` },
    alight: { ...northResult.alight, plannedAt: `${date}T12:05:00.000Z` },
    ...changes,
  };
}

export interface SearchAnswers {
  results?: (query: Record<string, unknown>) => TripSearchResult[];
  days?: { date: string; count: number }[];
  nearby?: TripSearchResult[];
}

/** Place search over the sample points and Þorlákshöfn, and the two search routes. */
export function searchApi(client: FakeClient, answers: SearchAnswers = {}) {
  client.answer("/v1/places/search", (input) => {
    const { q } = input["query"] as { q: string };
    const typed = q.toLowerCase();
    const points = tripPoints.filter((point) => point.name.en.toLowerCase().startsWith(typed));
    return ok(200, {
      results: [
        ...points.map((meetingPoint) => ({ kind: "meetingPoint", meetingPoint })),
        ...(thorlakshofn.name.en.toLowerCase().startsWith(typed)
          ? [{ kind: "place", place: thorlakshofn }]
          : []),
      ],
    });
  });
  client.answer("/v1/trips/search", (input) => {
    const query = input["query"] as Record<string, unknown>;
    const seats = Number(query["seats"] ?? 1);
    const found = answers.results?.(query) ?? [northResult];
    // The total is for the seats searched, as on the server (rule P1).
    return ok(200, {
      results: found.map((result) => ({
        ...result,
        total: { ...result.pricePerSeat, amount: result.pricePerSeat.amount * seats },
      })),
    });
  });
  client.answer("/v1/trips/search/alternatives", () =>
    ok(200, { days: answers.days ?? [], nearby: answers.nearby ?? [] }),
  );
}

/** The query of each trip search made, oldest first. */
export const searchesOf = (client: FakeClient, path = "/v1/trips/search") =>
  client.calls.filter((call) => call.path === path).map((call) => call.input["query"]);

/** The north trip's stops, a stretch apiece priced 1100, 2900 and 2000 kr. */
export const northStops = [
  { meetingPoint: bsi, plannedAt: "2026-11-15T09:00:00.000Z" },
  { meetingPoint: borgarnes, plannedAt: "2026-11-15T10:00:00.000Z" },
  { meetingPoint: blonduos, plannedAt: "2026-11-15T12:05:00.000Z" },
  { meetingPoint: hof, plannedAt: "2026-11-15T14:00:00.000Z" },
].map((stop, position) => ({ ...stop, position }));
const stretchPrices = [1100, 2900, 2000];

/** The north trip opened for a part, as the API answers it; `changes` override the rest. */
export function northTrip(
  part: { board: number; alight: number; seats?: number },
  changes: Partial<Omit<TripDetails, "part">> & { part?: Partial<TripDetails["part"]> } = {},
): TripDetails {
  const seats = part.seats ?? 1;
  const price = stretchPrices.slice(part.board, part.alight).reduce((sum, kr) => sum + kr, 0);
  const { part: partChanges, ...rest } = changes;
  return {
    id: northResult.tripId,
    stops: northStops,
    part: {
      board: part.board,
      alight: part.alight,
      seats,
      freeSeats: 2,
      pricePerSeat: { amount: price, currency: "ISK" },
      total: { amount: price * seats, currency: "ISK" },
      state: seats > 2 ? "full" : "open",
      ...partChanges,
    },
    seatsOffered: 3,
    // As a visitor not signed in sees it: no profile reference.
    driver: { firstName: "Anna", colour: 1, profileId: null, photo: null, ...newcomer },
    car: { make: "Toyota", model: "Yaris", colour: "white" },
    preferences: {
      luggage: "suitcase",
      pets: "ask",
      smoking: "no",
      childSeat: false,
      chat: "some",
    },
    note: "",
    bookingMode: "approval",
    myBooking: null,
    drivenByMe: false,
    ...rest,
  };
}

/**
 * Trip details for the north trip, for any part asked for; `answer` can
 * replace the trip or the whole answer.
 */
export function tripDetailsApi(
  client: FakeClient,
  answer: (query: Record<string, unknown>) => unknown = (query) => {
    const board = Number(query["fromStop"] ?? 0);
    const alight = Number(query["toStop"] ?? northStops.length - 1);
    if (board >= alight || alight >= northStops.length) {
      return failure(400, "validation_failed", {
        details: [{ path: board >= alight ? "fromStop" : "toStop", issue: "invalid_part" }],
      });
    }
    return ok(200, northTrip({ board, alight, seats: Number(query["seats"] ?? 1) }));
  },
) {
  client.answer(
    "/v1/trips/{id}",
    (input) => {
      const { id } = input["params"] as { id: string };
      // As the server: an address that is not a trip id fails its check.
      if (!/^[0-9a-f-]{36}$/.test(id)) {
        return failure(400, "validation_failed", {
          details: [{ path: "id", issue: "invalid_format" }],
        });
      }
      if (id !== northResult.tripId) return failure(404, "not_found");
      return answer(input["query"] as Record<string, unknown>);
    },
    "get",
  );
}

/**
 * A ride leaving soon (spec 4, 3.8): the north trip for its whole route,
 * on `date`, one seat. `n` tells rides on one day apart.
 */
export function soonRide(date: string, n = 0, changes: Partial<TripSearchResult> = {}) {
  const ride: TripSearchResult = {
    ...northResult,
    tripId: `0190a1d6-0000-7000-8000-${date.replaceAll("-", "")}${String(n).padStart(4, "0")}`,
    board: {
      ...northResult.board,
      position: 0,
      meetingPoint: bsi,
      plannedAt: `${date}T09:00:00.000Z`,
    },
    alight: {
      ...northResult.alight,
      position: 3,
      meetingPoint: hof,
      plannedAt: `${date}T14:00:00.000Z`,
    },
    pricePerSeat: { amount: 6000, currency: "ISK" },
    total: { amount: 6000, currency: "ISK" },
    ...changes,
  };
  return ride;
}

/** Rides leaving soon on the days from Sunday 15 November, one a day. */
export const soonRides = (count: number) =>
  Array.from({ length: count }, (_, day) => soonRide(`2026-11-${String(15 + day)}`));

/** The rides leaving soon: the first `limit` of `rides`, or a failure. */
export function soonestApi(client: FakeClient, rides: TripSearchResult[] | "failure") {
  client.answer("/v1/trips/soonest", (input) => {
    if (rides === "failure") return failure(500, "internal_error");
    const { limit } = input["query"] as { limit?: number };
    return ok(200, { results: rides.slice(0, limit ?? 20) });
  });
}
