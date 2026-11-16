// A fake trips API for screen tests: it keeps drafts, quotes routes with
// round numbers (100 km and an hour a stretch, 15 kr a km at 100%) and
// publishes. Not used by the app itself.
import type {
  CancelTripBody,
  DriverReadiness,
  MeetingPointSummary,
  MyTrip,
  Quote,
  Vehicle,
} from "@shareride/contracts";
import { firstTripChoices } from "@shareride/domain";
import { failure, ok, type FakeClient } from "./fake-client";
import { bsi, hof, kef } from "./meeting-points";

export const borgarnes: MeetingPointSummary = {
  ...bsi,
  id: "0190a1d6-0000-7000-8000-0000000000b5",
  name: { is: "Borgarnes", en: "Borgarnes" },
  region: "west",
  municipality: "Borgarbyggð",
  type: "fuel-station",
};

export const blonduos: MeetingPointSummary = {
  ...bsi,
  id: "0190a1d6-0000-7000-8000-0000000000b6",
  name: { is: "Blönduós", en: "Blönduós" },
  region: "northwest",
  municipality: "Húnabyggð",
  type: "fuel-station",
};

export const tripPoints = [bsi, borgarnes, blonduos, hof, kef];

export const yaris: Vehicle = {
  id: "0190a1d6-0000-7000-8000-0000000000a1",
  make: "Toyota",
  model: "Yaris",
  colour: "white",
  registration: null,
};

export const readyDriver: DriverReadiness = {
  ready: true,
  items: [
    { item: "photo", done: false, blocking: false },
    { item: "car", done: true, blocking: true },
    { item: "licence", done: true, blocking: true },
  ],
  licenceDeclaredAt: "2026-11-14T12:00:00.000Z",
};

const stretchM = 100_000;
const stretchS = 3600;
const kr = (amount: number) => ({ amount, currency: "ISK" as const });
const point = (id: string) => {
  const found = tripPoints.find((known) => known.id === id);
  if (found === undefined) throw new Error(`No test point ${id}`);
  return found;
};

/** A level's highest for the seats: 200% up to 3 seats, then 110%. */
export const highestLevel = (seats: number) => (seats <= 3 ? 200 : 110);
/** A stretch's price at a level: 1 500 kr at 100%, rounded to 100 kr. */
export const stretchPrice = (level: number) => Math.round((1500 * level) / 100 / 100) * 100;

export function quoteFor(body: {
  stops: string[];
  add?: string;
  seats: number;
  priceLevel?: number;
}): Quote {
  const stops = [...body.stops];
  // An added point goes after the first stop.
  if (body.add !== undefined) stops.splice(1, 0, body.add);
  const highest = highestLevel(body.seats);
  const asked = body.priceLevel ?? 100;
  const level = Math.min(asked, highest);
  const segments = stops.slice(1).map((to, index) => ({
    from: stops[index] ?? "",
    to,
    distanceM: stretchM,
    durationS: stretchS,
    suggestedPrice: kr(stretchPrice(100)),
    cap: kr(stretchPrice(highest)),
    price: kr(stretchPrice(level)),
  }));
  return {
    stops,
    segments,
    distanceM: stretchM * segments.length,
    durationS: stretchS * segments.length,
    directDistanceM: stretchM * segments.length,
    priceLevel: level,
    highestPriceLevel: highest,
    priceLevelStep: 10,
    wholeRoutePrice: kr(stretchPrice(level) * segments.length),
    plannedTimes: null,
    problems: [],
    warnings: [
      // The airport is out of the way.
      ...stops.flatMap((id, stop) =>
        id === kef.id ? [{ code: "stop_adds_distance" as const, stop, addedM: 35_000 }] : [],
      ),
      ...(asked > highest ? [{ code: "price_level_lowered" as const }] : []),
    ],
  };
}

interface TripsApi {
  /** The trips as the fake API holds them now. */
  readonly trips: () => MyTrip[];
  /** Makes publishing answer 422 with these details. */
  refuse(details: { path: string; issue: string }[]): void;
}

/**
 * A driver with a car, ready to drive, and the trips API around them.
 * `answers.cancel` can replace what cancelling a trip answers; `undefined`
 * cancels it.
 */
export function tripsApi(
  client: FakeClient,
  start: MyTrip[] = [],
  answers: { cancel?: () => unknown } = {},
): TripsApi {
  let trips = [...start];
  let refusal: { path: string; issue: string }[] | null = null;
  // Each change moves updatedAt on a second, as the server stamps its clock.
  let changes = 0;
  const stamp = () => {
    changes += 1;
    return new Date(Date.UTC(2026, 10, 14, 12, 0, changes)).toISOString();
  };
  client.answer("/v1/me/driver-readiness", () => ok(200, readyDriver));
  client.answer("/v1/me/vehicles", () => ok(200, { vehicles: [yaris] }));
  client.answer("/v1/places/search", (input) => {
    const { q } = input["query"] as { q: string };
    const found = tripPoints.filter((known) =>
      known.name.en.toLowerCase().startsWith(q.toLowerCase()),
    );
    return ok(200, {
      results: found.map((meetingPoint) => ({ kind: "meetingPoint", meetingPoint })),
    });
  });
  client.answer("/v1/routes/stops-along", (input) => {
    const { from, to } = input["query"] as { from: string; to: string };
    const along = from === bsi.id && to === hof.id ? [borgarnes, blonduos] : [];
    return ok(200, { meetingPoints: from === hof.id ? along.reverse() : along });
  });
  client.answer("/v1/routes/quote", (input) => ok(200, quoteFor(input["body"] as never)));

  const store = (trip: MyTrip) => {
    trips = [...trips.filter((known) => known.id !== trip.id), trip];
    return trip;
  };
  const find = (input: Record<string, unknown>) =>
    trips.find((trip) => trip.id === (input["params"] as { id: string }).id);

  client.answer("/v1/trips", (input) => {
    const body = input["body"] as { stops: string[] };
    const trip: MyTrip = {
      id: `0190a1d6-0000-7000-8000-00000000010${String(trips.length)}`,
      status: "draft",
      stops: body.stops.map((id) => ({ meetingPoint: point(id), plannedAt: null })),
      ...firstTripChoices,
      seats: firstTripChoices.seats,
      vehicleId: yaris.id,
      note: "",
      departsAt: null,
      arrivesAt: null,
      publishedAt: null,
      updatedAt: "2026-11-14T12:00:00.000Z",
      segments: [],
      openRequests: 0,
      requestsCloseAt: null,
      cancellation: null,
    };
    return ok(201, store(trip));
  });
  // The fake trips are all still to come, so none are past.
  client.answer("/v1/me/trips", (input) => {
    const { when } = input["query"] as { when: "upcoming" | "past" };
    return ok(200, { trips: when === "past" ? [] : trips });
  });
  client.answer("/v1/me/trips/{id}", (input) => {
    const trip = find(input);
    return trip === undefined ? failure(404, "not_found") : ok(200, trip);
  });
  client.answer("/v1/trips/{id}", (input) => {
    const trip = find(input);
    if (trip === undefined) return failure(404, "not_found");
    const body = input["body"] as
      (Partial<Omit<MyTrip, "stops">> & { stops?: string[]; plannedTimes?: string[] }) | undefined;
    if (body === undefined) {
      trips = trips.filter((known) => known !== trip);
      return ok(204);
    }
    const { stops, plannedTimes, ...rest } = body;
    let changed: MyTrip = {
      ...trip,
      ...rest,
      updatedAt: stamp(),
      ...(stops === undefined
        ? {}
        : { stops: stops.map((id) => ({ meetingPoint: point(id), plannedAt: null })) }),
    };
    if (plannedTimes !== undefined) {
      changed = {
        ...changed,
        stops: changed.stops.map((stop, index) => ({
          ...stop,
          plannedAt: plannedTimes[index] ?? null,
        })),
        departsAt: plannedTimes[0] ?? null,
        arrivesAt: plannedTimes.at(-1) ?? null,
      };
    }
    return ok(200, store(changed));
  });
  client.answer("/v1/trips/{id}/publish", (input) => {
    const trip = find(input);
    if (trip === undefined) return failure(404, "not_found");
    if (refusal !== null) return failure(422, "trip_not_publishable", { details: refusal });
    return ok(
      200,
      store({
        ...trip,
        status: "published",
        publishedAt: "2026-11-14T12:05:00.000Z",
        updatedAt: stamp(),
      }),
    );
  });
  client.answer("/v1/trips/{id}/cancel", (input) => {
    const answered = answers.cancel?.();
    if (answered !== undefined) return answered;
    const trip = find(input);
    if (trip === undefined) return failure(404, "not_found");
    if (trip.status !== "published") return failure(409, "trip_not_cancellable");
    const { reason, note } = input["body"] as CancelTripBody;
    // As the server counts it, on a trip with someone who paid (R6.7).
    const countsOnReliability = reason !== "weather" && reason !== "road_closed";
    return ok(
      200,
      store({
        ...trip,
        status: "cancelled",
        cancellation: { reason, note: note ?? "", countsOnReliability },
        updatedAt: stamp(),
      }),
    );
  });
  return {
    trips: () => trips,
    refuse(details) {
      refusal = details;
    },
  };
}

/** A draft from the bus terminal to Akureyri through Borgarnes, leaving at 09:00 on 15 November. */
export function plannedDraft(changes: Partial<MyTrip> = {}): MyTrip {
  const times = [
    "2026-11-15T09:00:00.000Z",
    "2026-11-15T10:00:00.000Z",
    "2026-11-15T11:00:00.000Z",
  ];
  return {
    id: "0190a1d6-0000-7000-8000-000000000201",
    status: "draft",
    stops: [bsi, borgarnes, hof].map((meetingPoint, index) => ({
      meetingPoint,
      plannedAt: times[index] ?? null,
    })),
    ...firstTripChoices,
    vehicleId: yaris.id,
    note: "",
    departsAt: times[0] ?? null,
    arrivesAt: times[2] ?? null,
    publishedAt: null,
    updatedAt: "2026-11-14T12:00:00.000Z",
    segments: [],
    openRequests: 0,
    requestsCloseAt: null,
    cancellation: null,
    ...changes,
  };
}
