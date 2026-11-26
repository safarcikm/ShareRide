// A fake trips API for screen tests: it keeps drafts, quotes routes with
// round numbers (100 km and an hour a stretch, 15 kr a km at 100%) and
// publishes. Not used by the app itself.
import type {
  CancelTripBody,
  DriverReadiness,
  MeetingPointSummary,
  MyTrip,
  Quote,
  TripChangeBody,
  TripChangeEffect,
  Vehicle,
} from "@shareride/contracts";
import {
  defaultSettingValues,
  defaultTripSettings,
  firstTripChoices,
  fitLevelWithin,
  priceSettingsFrom,
  segmentPrice,
} from "@shareride/domain";
import { failure, ok, type FakeClient } from "./fake-client";
import { bsi, hof, kef } from "./meeting-points";

/** The price values a trip has while the operator has changed none. */
export const startingPriceSettings = priceSettingsFrom(defaultSettingValues);

const minuteMs = 60_000;
const shifted = (time: string, minutes: number) =>
  new Date(new Date(time).getTime() + minutes * minuteMs).toISOString();

/** A stop of a driver's trip; its ID comes from its meeting point's, which is once on a trip. */
export function myStop(
  meetingPoint: MeetingPointSummary,
  plannedAt: string | null,
): MyTrip["stops"][number] {
  return { id: `5${meetingPoint.id.slice(1)}`, meetingPoint, plannedAt, checkIn: null };
}

/**
 * The trip day as the API gives it (spec 8, 3.1): on a trip that runs, the
 * phase (upcoming unless the test set another) and when the driver's "I'm
 * here" opens and closes at each stop, 30 minutes before and 60 after.
 */
export function withTripDay(trip: MyTrip): MyTrip {
  const runs = trip.status !== "draft" && trip.status !== "cancelled";
  return {
    ...trip,
    phase: runs ? (trip.phase ?? "upcoming") : null,
    stops: trip.stops.map((stop) => ({
      ...stop,
      checkIn:
        runs && stop.plannedAt !== null
          ? {
              opensAt: shifted(stop.plannedAt, -30),
              closesAt: shifted(stop.plannedAt, 60),
              at: stop.checkIn?.at ?? null,
            }
          : null,
    })),
  };
}

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

/** On the way from BSÍ to Borgarnes, for a stop added to a published trip. */
export const mosfellsbaer: MeetingPointSummary = {
  ...bsi,
  id: "0190a1d6-0000-7000-8000-0000000000b7",
  name: { is: "Mosfellsbæ", en: "Mosfellsbær" },
  municipality: "Mosfellsbær",
  type: "fuel-station",
};

export const tripPoints = [bsi, borgarnes, blonduos, hof, kef, mosfellsbaer];

export const yaris: Vehicle = {
  id: "0190a1d6-0000-7000-8000-0000000000a1",
  make: "Toyota",
  model: "Yaris",
  colour: "white",
  registration: null,
};

/** Another car of the driver's, to change to. */
export const volvo: Vehicle = {
  id: "0190a1d6-0000-7000-8000-0000000000a2",
  make: "Volvo",
  model: "XC40",
  colour: "red",
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

export interface TripsApi {
  /** The trips as the fake API holds them now. */
  readonly trips: () => MyTrip[];
  /** Makes publishing answer 422 with these details. */
  refuse(details: { path: string; issue: string }[]): void;
}

/**
 * A driver with a car, ready to drive, and the trips API around them.
 * `answers.cancel` can replace what cancelling a trip answers, and
 * `answers.change` what changing one answers, with or without `preview`;
 * `undefined` does it. `answers.told` says whom a change tells (`told`, of
 * whom `freeCancellations` may cancel for free) and the requests it leaves
 * waiting or makes expire; nobody by default. `answers.cars` are the
 * driver's cars, the Yaris by default.
 */
export function tripsApi(
  client: FakeClient,
  start: MyTrip[] = [],
  answers: {
    cars?: readonly Vehicle[];
    cancel?: () => unknown;
    change?: (preview: boolean) => unknown;
    told?: Partial<Pick<TripChangeEffect, "told" | "freeCancellations" | "requests" | "expiring">>;
    /** What adding or removing a stop does to the level, when not left as it is. */
    stopEffect?: Partial<
      Pick<TripChangeEffect, "priceLevel" | "priceLevelLowered" | "levelLimitedBy">
    >;
    /** Meeting points a copy of a trip leaves out, as no longer in use. */
    dropped?: readonly MeetingPointSummary[];
    /** Answers copying a trip instead, when it gives anything. */
    copy?: () => unknown;
    /** A copy is made only once this settles, for taps while it is being made. */
    copyAfter?: Promise<unknown>;
  } = {},
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
  client.answer("/v1/me/vehicles", () => ok(200, { vehicles: answers.cars ?? [yaris] }));
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

  const store = (stored: MyTrip) => {
    const trip = withTripDay(stored);
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
      stops: body.stops.map((id) => myStop(point(id), null)),
      ...firstTripChoices,
      seats: firstTripChoices.seats,
      vehicleId: yaris.id,
      note: "",
      departsAt: null,
      arrivesAt: null,
      publishedAt: null,
      updatedAt: "2026-11-14T12:00:00.000Z",
      segments: [],
      takings: { amount: 0, currency: "ISK" },
      openRequests: 0,
      requestsCloseAt: null,
      firstRequest: null,
      toRate: null,
      cancellation: null,
      phase: null,
      priceSettings: startingPriceSettings,
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
      ...(stops === undefined ? {} : { stops: stops.map((id) => myStop(point(id), null)) }),
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
  // Post again, or the return: a draft with the trip's choices and no times.
  client.answer("/v1/trips/{id}/copy", (input) => {
    const trip = find(input);
    if (trip === undefined) return failure(404, "not_found");
    const answered = answers.copy?.();
    if (answered !== undefined) return answered;
    return answers.copyAfter === undefined
      ? copyOf(trip, input)
      : answers.copyAfter.then(() => copyOf(trip, input));
  });
  const copyOf = (trip: MyTrip, input: Record<string, unknown>) => {
    const { reverse } = input["query"] as { reverse: boolean };
    const dropped = answers.dropped ?? [];
    const kept = (reverse ? [...trip.stops].reverse() : trip.stops).filter(
      (stop) => !dropped.some((point) => point.id === stop.meetingPoint.id),
    );
    const copy: MyTrip = {
      ...trip,
      id: `0190a1d6-0000-7000-8000-00000000030${String(trips.length)}`,
      status: "draft",
      stops: kept.map((stop) => myStop(stop.meetingPoint, null)),
      departsAt: null,
      arrivesAt: null,
      publishedAt: null,
      updatedAt: stamp(),
      segments: [],
      takings: { amount: 0, currency: "ISK" },
      openRequests: 0,
      requestsCloseAt: null,
      firstRequest: null,
      toRate: null,
      cancellation: null,
    };
    return ok(201, { trip: store(copy), dropped });
  };
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
  /**
   * A stop added as the rules would place it here: after the first stop,
   * half way to the second on 5 minutes, splitting that stretch and its
   * price in two (spec 6, 3.2).
   */
  function addStop(trip: MyTrip, meetingPointId: string, preview: boolean) {
    const meetingPoint = tripPoints.find((point) => point.id === meetingPointId);
    const [first, second, ...rest] = trip.stops;
    const [split, ...others] = trip.segments;
    if (meetingPoint === undefined || first === undefined || second === undefined) {
      return failure(422, "change_not_allowed");
    }
    const fiveMinutes = 5 * 60_000;
    const between =
      (new Date(first.plannedAt ?? 0).getTime() + new Date(second.plannedAt ?? 0).getTime()) / 2;
    const plannedAt = new Date(Math.round(between / fiveMinutes) * fiveMinutes).toISOString();
    const stops = [first, myStop(meetingPoint, plannedAt), second, ...rest];
    // A fifth of the stretch to the new stop, the rest on from it.
    const halves =
      split === undefined
        ? []
        : [0.2, 0.8].map((share) => ({
            ...split,
            distanceM: Math.round(split.distanceM * share),
            durationS: Math.round(split.durationS * share),
            price: { ...split.price, amount: Math.round(split.price.amount * share) },
          }));
    const segments = [...halves, ...others];
    if (!preview) store({ ...trip, stops, segments, updatedAt: stamp() });
    return ok(200, {
      departsAt: trip.departsAt ?? "",
      arrivesAt: trip.arrivesAt ?? "",
      stops: stops.map((stop) => stop.meetingPoint.id),
      plannedTimes: stops.map((stop) => stop.plannedAt ?? ""),
      told: 0,
      freeCancellations: 0,
      requests: 0,
      expiring: 0,
      seats: trip.seats,
      priceLevel: trip.priceLevel,
      priceLevelLowered: false,
      levelLimitedBy: null,
      prices: segments.map((segment) => segment.price),
      ...answers.told,
      ...answers.stopEffect,
    } satisfies TripChangeEffect);
  }

  /**
   * A stop removed as the rules would remove it here: the stops either
   * side keep their times, and the way past it costs a tenth less than the
   * two stretches did (spec 6, 3.2). Only a stop between the ends can go.
   */
  function removeStop(trip: MyTrip, meetingPointId: string, preview: boolean) {
    const position = trip.stops.findIndex((stop) => stop.meetingPoint.id === meetingPointId);
    const there = trip.segments[position - 1];
    const onwards = trip.segments[position];
    if (there === undefined || onwards === undefined) {
      return failure(422, "change_not_allowed", {
        details: [{ path: "meetingPointId", issue: "stop_at_end" }],
      });
    }
    const past = {
      ...there,
      distanceM: Math.round((there.distanceM + onwards.distanceM) * 0.9),
      durationS: Math.round((there.durationS + onwards.durationS) * 0.9),
      price: {
        ...there.price,
        amount: Math.round((there.price.amount + onwards.price.amount) * 0.9),
      },
    };
    const stops = trip.stops.filter((_, index) => index !== position);
    const segments = [
      ...trip.segments.slice(0, position - 1),
      past,
      ...trip.segments.slice(position + 1),
    ];
    if (!preview) store({ ...trip, stops, segments, updatedAt: stamp() });
    return ok(200, {
      departsAt: trip.departsAt ?? "",
      arrivesAt: trip.arrivesAt ?? "",
      stops: stops.map((stop) => stop.meetingPoint.id),
      plannedTimes: stops.map((stop) => stop.plannedAt ?? ""),
      told: 0,
      freeCancellations: 0,
      requests: 0,
      expiring: 0,
      seats: trip.seats,
      priceLevel: trip.priceLevel,
      priceLevelLowered: false,
      levelLimitedBy: null,
      prices: segments.map((segment) => segment.price),
      ...answers.told,
      ...answers.stopEffect,
    } satisfies TripChangeEffect);
  }

  client.answer("/v1/trips/{id}/changes", (input) => {
    const { preview = false } = (input["query"] ?? {}) as { preview?: boolean };
    const answered = answers.change?.(preview);
    if (answered !== undefined) return answered;
    const trip = find(input);
    if (trip === undefined) return failure(404, "not_found");
    if (trip.status !== "published") return failure(409, "trip_not_changeable");
    const body = input["body"] as TripChangeBody;
    if (body.kind === "addStop") return addStop(trip, body.meetingPointId, preview);
    if (body.kind === "removeStop") return removeStop(trip, body.meetingPointId, preview);
    const departsAt = body.kind === "departure" ? body.departsAt : (trip.departsAt ?? "");
    // Every stop moves with the departure (R6.2).
    const byMs = new Date(departsAt).getTime() - new Date(trip.departsAt ?? departsAt).getTime();
    const plannedTimes = trip.stops.map((stop) =>
      new Date(new Date(stop.plannedAt ?? departsAt).getTime() + byMs).toISOString(),
    );
    // As the rules work out seats and price levels (P3, P4).
    const seats = body.kind === "seats" ? body.seats : trip.seats;
    // What is booked counts too (rule P4, spec 17).
    const fitted =
      body.kind === "priceLevel"
        ? { level: body.priceLevel, lowered: false, limitedBy: null }
        : fitLevelWithin(
            trip.priceLevel,
            {
              distancesM: trip.segments.map((segment) => segment.distanceM),
              occupancy: trip.segments.map((segment) => segment.seatsTaken),
              seats,
              takings: trip.takings.amount,
            },
            defaultTripSettings,
          );
    const repriced = body.kind === "seats" || body.kind === "priceLevel";
    const prices = trip.segments.map((segment) =>
      repriced
        ? segmentPrice(segment.distanceM, fitted.level, seats, defaultTripSettings)
        : segment.price,
    );
    const effect: TripChangeEffect = {
      departsAt: plannedTimes[0] ?? departsAt,
      arrivesAt: plannedTimes.at(-1) ?? departsAt,
      stops: trip.stops.map((stop) => stop.meetingPoint.id),
      plannedTimes,
      told: 0,
      freeCancellations: 0,
      requests: 0,
      expiring: 0,
      seats,
      priceLevel: fitted.level,
      priceLevelLowered: fitted.lowered,
      levelLimitedBy: fitted.lowered ? fitted.limitedBy : null,
      prices,
      ...answers.told,
    };
    if (!preview) {
      store({
        ...trip,
        stops: trip.stops.map((stop, index) => ({
          ...stop,
          plannedAt: plannedTimes[index] ?? null,
        })),
        departsAt: effect.departsAt,
        arrivesAt: effect.arrivesAt,
        seats,
        priceLevel: fitted.level,
        segments: trip.segments.map((segment, index) => ({
          ...segment,
          price: prices[index] ?? segment.price,
        })),
        ...(body.kind === "bookingMode" ? { bookingMode: body.bookingMode } : {}),
        ...(body.kind === "vehicle" ? { vehicleId: body.vehicleId } : {}),
        ...(body.kind === "details" ? { preferences: body.preferences, note: body.note } : {}),
        updatedAt: stamp(),
      });
    }
    return ok(200, effect);
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
    stops: [bsi, borgarnes, hof].map((meetingPoint, index) =>
      myStop(meetingPoint, times[index] ?? null),
    ),
    ...firstTripChoices,
    vehicleId: yaris.id,
    note: "",
    departsAt: times[0] ?? null,
    arrivesAt: times[2] ?? null,
    publishedAt: null,
    updatedAt: "2026-11-14T12:00:00.000Z",
    segments: [],
    takings: { amount: 0, currency: "ISK" },
    openRequests: 0,
    requestsCloseAt: null,
    firstRequest: null,
    toRate: null,
    cancellation: null,
    phase: null,
    priceSettings: startingPriceSettings,
    ...changes,
  };
}
