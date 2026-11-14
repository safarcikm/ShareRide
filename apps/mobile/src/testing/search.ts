// Search results as the API returns them, and a fake search API, for screen
// tests. Not used by the app itself.
import type { TripSearchResult } from "@shareride/contracts";
import { ok, type FakeClient } from "./fake-client";
import { bsi, hof, thorlakshofn } from "./meeting-points";
import { blonduos, borgarnes, tripPoints } from "./trips";

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
  driver: { firstName: "Anna" },
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
