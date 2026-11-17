// Changing a published trip (spec 6, 3.2; rules R6.1 to R6.4, S5, P4): what
// the rules allow, and what a change does for the booked passengers, so
// the app can show it before saving and the API saves the same, stops
// added and removed included. Every change keeps the trip within its limit
// (rule P3, spec 17): the price level falls when it must.
import { movedFar } from "../bookings/cancellation.ts";
import type { Season } from "../meeting-points/catalogue.ts";
import type { NotificationEvent } from "../notifications/catalogue.ts";
import type { Money } from "../money.ts";
import { err, ok, type Result } from "../result.ts";
import { checkNote, type NoteProblem } from "./note.ts";
import { fitLevelWithin, isLevelWithin, type LevelLimit, type TripLoad } from "./limit.ts";
import { priceCap, segmentPrice, type PriceSettings } from "./prices.ts";
import { overlaps, type TimeWindow } from "./publish.ts";
import {
  insertionLegPairs,
  insertStop,
  stopsOutOfSeason,
  type DistancesMissing,
  type LegLookup,
} from "./route.ts";
import type { TripSettings } from "./settings.ts";
import { checkTimes, leavesTypicalTime, stopTimeBetween, type TimeProblem } from "./times.ts";
import type { BookingMode, TripPreferences, TripStatus } from "./trip.ts";

/**
 * With bookings, the departure moves at most this many minutes, earlier or
 * later, from the time each passenger booked (R6.4, decision 1). A bigger
 * change is a new trip: the driver cancels and posts again.
 */
export const maxMoveMinutes = 120;

const minuteMs = 60_000;

/** A published trip as changing it needs it. */
export interface ChangeableTrip {
  readonly status: Exclude<TripStatus, "draft">;
  /** In order, the departure first. */
  readonly stops: readonly {
    readonly meetingPointId: string;
    readonly plannedAt: Date;
    readonly season: Season;
  }[];
  /** Each segment's typical driving time in seconds, from its leg as it is now (R3.6). */
  readonly typicalS: readonly number[];
  /** Each segment's distance in metres, for its price and cap (rules P3, P4). */
  readonly distancesM: readonly number[];
  /** Seats held on each segment (rule S1). */
  readonly occupancy: readonly number[];
  readonly seats: number;
  readonly priceLevel: number;
  /**
   * What the trip's bookings pay or paid the driver, less refunds, in whole
   * krónur (rule P3; `takingsOf`).
   */
  readonly takings: number;
  readonly vehicleId: string;
  /** The driver's cars the trip can take: theirs and not removed (spec 4). */
  readonly cars: readonly string[];
  readonly bookingMode: BookingMode;
  readonly preferences: TripPreferences;
  readonly note: string;
  /** The driver's other published trips (R3.7). */
  readonly otherTrips: readonly TimeWindow[];
}

/** A booking that holds seats on the trip (rule S1). */
export interface BookingOnTrip {
  readonly id: string;
  readonly status: "requested" | "accepted" | "confirmed";
  /** The trip's departure when the booking was made (R6.3, R6.4). */
  readonly departsAtWhenBooked: Date;
  /** Where it gets in and out, by meeting point (R6.5). */
  readonly fromPoint: string;
  readonly toPoint: string;
}

/** A meeting point the driver adds to a published trip (spec 6, 3.2). */
export interface StopToAdd {
  readonly meetingPointId: string;
  readonly season: Season;
  /** Offered for new trips (R3.2): a paused, retiring or retired point is not. */
  readonly offered: boolean;
}

/** What a change is to, as each one is recorded (spec 6, section 6: `TripChange`). */
export const tripChangeKinds = [
  "departure",
  "seats",
  "priceLevel",
  "vehicle",
  "bookingMode",
  "details",
  "addStop",
  "removeStop",
] as const satisfies readonly TripChange["kind"][];

/** One change at a time, as the driver saves it from Edit trip. */
export type TripChange =
  | { readonly kind: "departure"; readonly departsAt: Date }
  | { readonly kind: "seats"; readonly seats: number }
  | { readonly kind: "priceLevel"; readonly priceLevel: number }
  | { readonly kind: "vehicle"; readonly vehicleId: string }
  | { readonly kind: "bookingMode"; readonly bookingMode: BookingMode }
  | { readonly kind: "details"; readonly preferences: TripPreferences; readonly note: string }
  /**
   * A stop where it adds the least distance, as when posting (spec 3,
   * 3.4.3), with the legs `addStopLegPairs` names.
   */
  | { readonly kind: "addStop"; readonly stop: StopToAdd; readonly legs: LegLookup }
  /**
   * A stop between the first and the last that no booking uses (R6.5), with
   * the leg past it that `removeStopLegPairs` names.
   */
  | { readonly kind: "removeStop"; readonly meetingPointId: string; readonly legs: LegLookup };

/** The changes that add or remove a stop, which are checked on their own. */
type StopChange = Extract<TripChange, { readonly kind: "addStop" | "removeStop" }>;

export type ChangeProblem =
  | { readonly code: "trip_cancelled" }
  | { readonly code: "trip_departed" }
  | TimeProblem
  | { readonly code: "stop_out_of_season"; readonly stop: number }
  | { readonly code: "overlaps_trip" }
  /** The departures the bookings allow: within 2 hours of each booking's time (R6.4). */
  | { readonly code: "move_too_far"; readonly earliest: Date; readonly latest: Date }
  | { readonly code: "seats_invalid" }
  /** The most seats taken on any segment, the fewest the trip can offer (rule S5). */
  | { readonly code: "seats_below_taken"; readonly taken: number }
  | { readonly code: "price_level_invalid" }
  /** Not one of the driver's cars, or removed (spec 6, 3.2). */
  | { readonly code: "car_missing" }
  | NoteProblem
  /** The point is on the trip already, at this position (R3.2). */
  | { readonly code: "stop_on_trip"; readonly stop: number }
  /** The point is paused or retired (R3.2). */
  | { readonly code: "stop_unavailable" }
  /** The route would be over 1.5 times the direct distance (R3.4). */
  | { readonly code: "route_too_long" }
  /**
   * The stretches to the new stop and on from it need more than the time
   * between its neighbours, the ends of this segment (R3.6; milestone 6
   * plan, decision 2).
   */
  | { readonly code: "stop_does_not_fit"; readonly segment: number }
  /** The point is not one of the trip's stops. */
  | { readonly code: "stop_not_on_trip" }
  /** The first and last stops make the trip: without either it is a new one. */
  | { readonly code: "stop_at_end" }
  /**
   * Bookings get in or out at the stop, requests included: they are
   * cancelled or declined first (R6.5).
   */
  | { readonly code: "stop_in_use"; readonly bookings: number }
  /** The legs of a new point are still being worked out (spec 2, 3.7). */
  | DistancesMissing;

/** What one booked passenger is told of a change (spec 7, 3.3). */
export interface PassengerTold {
  readonly bookingId: string;
  /** By how many minutes from the departure when booked, for a move. */
  readonly event: Extract<NotificationEvent, { readonly type: "DepartureMoved" | "TripChanged" }>;
  /** A paid passenger may now cancel with a full refund, without it counting (R6.3). */
  readonly freeCancellation: boolean;
}

/** A segment's price per seat for new bookings, and the most it may cost (rules P3, P4). */
export interface SegmentPricing {
  readonly price: Money;
  readonly cap: Money;
}

/** Where a stop was added, splitting the segment before its position in two. */
export interface AddedStop {
  readonly position: number;
  readonly stretches: readonly [SegmentPricing, SegmentPricing];
}

/** Where a stop was removed, joining the segments either side of its position into one. */
export interface RemovedStop {
  readonly position: number;
  readonly stretch: SegmentPricing;
}

export interface ChangeEffect {
  /** The trip as it will be. */
  readonly trip: ChangeableTrip;
  /**
   * The price level fell to the highest that fits (rule P4; spec 3, 3.6.4;
   * spec 17): more seats allow less, or what is booked uses the trip limit.
   */
  readonly priceLevelLowered: boolean;
  /** What set the level it fell to; null when it did not fall. */
  readonly levelLimitedBy: LevelLimit | null;
  /**
   * Each segment's price and cap for new bookings after a change of seats or
   * price level, or a stop that lowered the level, as when publishing; null
   * when they stay. Bookings keep the prices they booked at (rule P1).
   */
  readonly pricing: readonly SegmentPricing[] | null;
  /**
   * A stop added: its position, and the stretch to it and the one on from
   * it, each priced for new bookings as when publishing (rules P3, P4); null
   * for other changes. The other stretches keep their prices.
   */
  readonly addedStop: AddedStop | null;
  /**
   * A stop removed: its position, and the stretch past it, priced for new
   * bookings as when publishing; null for other changes.
   */
  readonly removedStop: RemovedStop | null;
  /**
   * Who is told: each booked passenger, accepted or confirmed, for a move, a
   * new car, or a stop added or removed; nobody for the seats, price level, booking mode or details,
   * or when nothing changed. A request's passenger is told only if the trip
   * is cancelled (spec 7, 3.3).
   */
  readonly told: readonly PassengerTold[];
}

type ChangeSettings = Parameters<typeof checkTimes>[3] &
  PriceSettings &
  Pick<TripSettings, "maxSeats" | "routeFactorPercent">;

/** The trip as its limit sees it (rule P3). */
const loadOf = (trip: ChangeableTrip): TripLoad => ({
  distancesM: trip.distancesM,
  occupancy: trip.occupancy,
  seats: trip.seats,
  takings: trip.takings,
});

/** Each stretch's price and cap for new bookings, as when publishing (rules P3, P4). */
const pricingOf = (trip: ChangeableTrip, settings: ChangeSettings): SegmentPricing[] =>
  trip.distancesM.map((distanceM) => ({
    price: segmentPrice(distanceM, trip.priceLevel, trip.seats, settings),
    cap: priceCap(distanceM, trip.seats, settings),
  }));

/**
 * The legs `checkTripChange` looks up to add `stop` to a trip with these
 * stops: those that place it, and the first stop to the last (R3.4).
 */
export function addStopLegPairs(stops: readonly string[], stop: string): [string, string][] {
  const placing = insertionLegPairs(stops, stop);
  const first = stops[0];
  const last = stops.at(-1);
  if (placing.length === 0 || first === undefined || last === undefined) return placing;
  return [...placing, [first, last]];
}

/**
 * The leg `checkTripChange` looks up to remove `stop` from a trip with these
 * stops: from the stop before it to the one after. None for an end, or a
 * point not on the trip.
 */
export function removeStopLegPairs(stops: readonly string[], stop: string): [string, string][] {
  const position = stops.indexOf(stop);
  const before = stops[position - 1];
  const after = stops[position + 1];
  return position > 0 && before !== undefined && after !== undefined ? [[before, after]] : [];
}

/**
 * A booking's price for a stretch a new stop splits (spec 6, 3.2): shared
 * by the new stretches' distances, as prices are, and rounded so that the
 * booking keeps its total (rule P1). Whole krónur.
 */
export function splitPrice(
  price: number,
  distancesM: readonly [there: number, onwards: number],
): [number, number] {
  const [there, onwards] = distancesM;
  const first = Math.round((price * there) / (there + onwards));
  return [first, price - first];
}

/**
 * Whether a published trip can take a change now, and its effect. Every
 * broken rule comes at once, as when publishing. Nothing changes from the
 * planned departure on (R6.1): running late on the day is a chat message
 * (spec 7). Bookings keep their stops and price snapshots (rule P1).
 */
export function checkTripChange(
  trip: ChangeableTrip,
  bookings: readonly BookingOnTrip[],
  change: TripChange,
  now: Date,
  settings: ChangeSettings,
): Result<ChangeEffect, ChangeProblem[]> {
  if (trip.status === "cancelled") return err([{ code: "trip_cancelled" }]);
  const departsAt = trip.stops[0]?.plannedAt ?? now;
  if (trip.status !== "published" || departsAt <= now) return err([{ code: "trip_departed" }]);

  if (change.kind === "addStop" || change.kind === "removeStop") {
    const done =
      change.kind === "addStop"
        ? withStopAdded(trip, change, settings)
        : withStopRemoved(trip, bookings, change, settings);
    if (!done.ok) return done;
    const told = whoIsTold(trip, change, done.value.trip, bookings);
    // The new stretches' caps round on their own, so the limit can fall a
    // little: if what is booked no longer leaves room at this level, the
    // level falls and every stretch is priced again (spec 17).
    const fitted = fitLevelWithin(trip.priceLevel, loadOf(done.value.trip), settings);
    if (!fitted.lowered) {
      return ok({
        priceLevelLowered: false,
        levelLimitedBy: null,
        pricing: null,
        addedStop: null,
        removedStop: null,
        ...done.value,
        told,
      });
    }
    const after = { ...done.value.trip, priceLevel: fitted.level };
    const pricing = pricingOf(after, settings);
    const at = (segment: number): SegmentPricing =>
      pricing[segment] ?? {
        price: { amount: 0, currency: "ISK" },
        cap: { amount: 0, currency: "ISK" },
      };
    const added = "addedStop" in done.value ? done.value.addedStop : null;
    const removed = "removedStop" in done.value ? done.value.removedStop : null;
    return ok({
      trip: after,
      priceLevelLowered: true,
      levelLimitedBy: fitted.limitedBy,
      pricing,
      addedStop:
        added === null
          ? null
          : { position: added.position, stretches: [at(added.position - 1), at(added.position)] },
      removedStop:
        removed === null ? null : { position: removed.position, stretch: at(removed.position - 1) },
      told,
    });
  }
  const changed = applied(trip, change, settings);
  const problems = changeProblems(trip, bookings, change, changed.trip, now, settings);
  if (problems.length > 0) return err(problems);

  const after = changed.trip;
  const pricing =
    change.kind === "seats" || change.kind === "priceLevel" ? pricingOf(after, settings) : null;
  const told = whoIsTold(trip, change, after, bookings);
  return ok({ ...changed, pricing, addedStop: null, removedStop: null, told });
}

/**
 * The trip with a stop added where it adds the least distance (spec 3,
 * 3.4.3), at a time between its neighbours, which keep theirs (decision
 * 2), or the rules it breaks. Both halves of the stretch it splits keep its
 * occupancy, since everyone riding it rides both.
 */
function withStopAdded(
  trip: ChangeableTrip,
  change: Extract<TripChange, { readonly kind: "addStop" }>,
  settings: ChangeSettings,
): Result<{ readonly trip: ChangeableTrip; readonly addedStop: AddedStop }, ChangeProblem[]> {
  const { stop, legs } = change;
  const points = trip.stops.map((each) => each.meetingPointId);
  const onTrip = points.indexOf(stop.meetingPointId);
  if (onTrip !== -1) return err([{ code: "stop_on_trip", stop: onTrip }]);
  // Nothing else matters for a point that cannot be added.
  if (!stop.offered) return err([{ code: "stop_unavailable" }]);
  const placed = insertStop(points, stop.meetingPointId, legs);
  if (!placed.ok) return err([placed.error]);
  const position = placed.value.indexOf(stop.meetingPointId);
  const segment = position - 1;
  const before = trip.stops[segment];
  const after = trip.stops[position];
  const first = points[0] ?? "";
  const direct = legs(first, points.at(-1) ?? "");
  const there = before && legs(before.meetingPointId, stop.meetingPointId);
  const onwards = after && legs(stop.meetingPointId, after.meetingPointId);
  if (!before || !after || !direct || !there || !onwards) {
    // Only a trip with fewer than two stops; a published one has them (R3.2).
    return err([{ code: "distances_missing", pairs: [[first, stop.meetingPointId]] }]);
  }

  const problems: ChangeProblem[] = [];
  const departsAt = trip.stops[0]?.plannedAt ?? before.plannedAt;
  if (stopsOutOfSeason([stop.season], departsAt).length > 0) {
    problems.push({ code: "stop_out_of_season", stop: position });
  }
  const distanceM =
    trip.distancesM.reduce((total, each) => total + each, 0) -
    (trip.distancesM[segment] ?? 0) +
    there.distanceM +
    onwards.distanceM;
  if (100 * distanceM > settings.routeFactorPercent * direct.distanceM) {
    problems.push({ code: "route_too_long" });
  }
  const plannedAt = stopTimeBetween(
    before.plannedAt,
    after.plannedAt,
    there.durationS,
    onwards.durationS,
    settings,
  );
  if (plannedAt === undefined) problems.push({ code: "stop_does_not_fit", segment });
  if (plannedAt === undefined || problems.length > 0) return err(problems);

  const split = <T>(list: readonly T[], halves: readonly [T, T]): T[] => [
    ...list.slice(0, segment),
    ...halves,
    ...list.slice(position),
  ];
  const taken = trip.occupancy[segment] ?? 0;
  const priced = (stretchM: number): SegmentPricing => ({
    price: segmentPrice(stretchM, trip.priceLevel, trip.seats, settings),
    cap: priceCap(stretchM, trip.seats, settings),
  });
  return ok({
    trip: {
      ...trip,
      stops: [
        ...trip.stops.slice(0, position),
        { meetingPointId: stop.meetingPointId, plannedAt, season: stop.season },
        ...trip.stops.slice(position),
      ],
      typicalS: split(trip.typicalS, [there.durationS, onwards.durationS]),
      distancesM: split(trip.distancesM, [there.distanceM, onwards.distanceM]),
      occupancy: split(trip.occupancy, [taken, taken]),
    },
    addedStop: { position, stretches: [priced(there.distanceM), priced(onwards.distanceM)] },
  });
}

/**
 * The trip without a stop between its ends that no booking uses (R6.5),
 * joining the stretches either side into the way past it, or the rules it
 * breaks. Every other stop keeps its time, as when one is added.
 */
function withStopRemoved(
  trip: ChangeableTrip,
  bookings: readonly BookingOnTrip[],
  change: Extract<TripChange, { readonly kind: "removeStop" }>,
  settings: ChangeSettings,
): Result<{ readonly trip: ChangeableTrip; readonly removedStop: RemovedStop }, ChangeProblem[]> {
  const point = change.meetingPointId;
  const position = trip.stops.findIndex((stop) => stop.meetingPointId === point);
  if (position === -1) return err([{ code: "stop_not_on_trip" }]);
  const before = trip.stops[position - 1];
  const after = trip.stops[position + 1];
  if (before === undefined || after === undefined) return err([{ code: "stop_at_end" }]);

  const problems: ChangeProblem[] = [];
  const using = bookings.filter(
    (booking) => booking.fromPoint === point || booking.toPoint === point,
  ).length;
  if (using > 0) problems.push({ code: "stop_in_use", bookings: using });
  const past = change.legs(before.meetingPointId, after.meetingPointId);
  if (past === undefined) {
    // A stop in use says so first: the distance would not help.
    if (problems.length > 0) return err(problems);
    return err([
      { code: "distances_missing", pairs: [[before.meetingPointId, after.meetingPointId]] },
    ]);
  }
  const segment = position - 1;
  if (!leavesTypicalTime(before.plannedAt, after.plannedAt, past.durationS, settings)) {
    problems.push({ code: "stretch_too_fast", segment });
  }
  if (problems.length > 0) return err(problems);

  const join = <T>(list: readonly T[], value: T): T[] => [
    ...list.slice(0, segment),
    value,
    ...list.slice(position + 1),
  ];
  // Equal either side, since nobody gets in or out there; the larger is
  // kept so that seats are never counted short.
  const taken = Math.max(trip.occupancy[segment] ?? 0, trip.occupancy[position] ?? 0);
  return ok({
    trip: {
      ...trip,
      stops: trip.stops.filter((_, index) => index !== position),
      typicalS: join(trip.typicalS, past.durationS),
      distancesM: join(trip.distancesM, past.distanceM),
      occupancy: join(trip.occupancy, taken),
    },
    removedStop: {
      position,
      stretch: {
        price: segmentPrice(past.distanceM, trip.priceLevel, trip.seats, settings),
        cap: priceCap(past.distanceM, trip.seats, settings),
      },
    },
  });
}

/** The trip with the change made, before any rule is checked. */
function applied(
  trip: ChangeableTrip,
  change: Exclude<TripChange, StopChange>,
  settings: ChangeSettings,
): {
  readonly trip: ChangeableTrip;
  readonly priceLevelLowered: boolean;
  readonly levelLimitedBy: LevelLimit | null;
} {
  const kept = { priceLevelLowered: false, levelLimitedBy: null };
  switch (change.kind) {
    case "departure": {
      const byMs = change.departsAt.getTime() - (trip.stops[0]?.plannedAt.getTime() ?? 0);
      const stops = trip.stops.map((stop) => ({
        ...stop,
        plannedAt: new Date(stop.plannedAt.getTime() + byMs),
      }));
      return { trip: { ...trip, stops }, ...kept };
    }
    case "seats": {
      // The highest level for the seats and what is booked (rule P4, spec 17).
      const seated = { ...trip, seats: change.seats };
      const fitted = fitLevelWithin(trip.priceLevel, loadOf(seated), settings);
      return {
        trip: { ...seated, priceLevel: fitted.level },
        priceLevelLowered: fitted.lowered,
        levelLimitedBy: fitted.lowered ? fitted.limitedBy : null,
      };
    }
    case "priceLevel":
      return { trip: { ...trip, priceLevel: change.priceLevel }, ...kept };
    case "vehicle":
      return { trip: { ...trip, vehicleId: change.vehicleId }, ...kept };
    case "bookingMode":
      return { trip: { ...trip, bookingMode: change.bookingMode }, ...kept };
    case "details":
      return { trip: { ...trip, preferences: change.preferences, note: change.note }, ...kept };
  }
}

function changeProblems(
  trip: ChangeableTrip,
  bookings: readonly BookingOnTrip[],
  change: Exclude<TripChange, StopChange>,
  after: ChangeableTrip,
  now: Date,
  settings: ChangeSettings,
): ChangeProblem[] {
  switch (change.kind) {
    case "departure":
      return departureProblems(trip, bookings, after, now, settings);
    case "seats": {
      if (!Number.isInteger(change.seats) || change.seats < 1 || change.seats > settings.maxSeats) {
        return [{ code: "seats_invalid" }];
      }
      const taken = Math.max(0, ...trip.occupancy);
      return change.seats < taken ? [{ code: "seats_below_taken", taken }] : [];
    }
    case "priceLevel":
      // A step from free to the highest the seats and what is booked allow
      // (rule P4, spec 17).
      return isLevelWithin(change.priceLevel, loadOf(trip), settings)
        ? []
        : [{ code: "price_level_invalid" }];
    case "details":
      return checkNote(change.note);
    case "vehicle":
      // The car the trip has stays, even once removed: nothing changes.
      return change.vehicleId === trip.vehicleId || trip.cars.includes(change.vehicleId)
        ? []
        : [{ code: "car_missing" }];
    case "bookingMode":
      return [];
  }
}

/** R6.2 to R6.4, and the time rules of publishing (R2.5, R3.5 to R3.7). */
function departureProblems(
  trip: ChangeableTrip,
  bookings: readonly BookingOnTrip[],
  after: ChangeableTrip,
  now: Date,
  settings: ChangeSettings,
): ChangeProblem[] {
  const times = after.stops.map((stop) => stop.plannedAt);
  const departsAt = times[0];
  const arrivesAt = times.at(-1);
  if (departsAt === undefined || arrivesAt === undefined) return [{ code: "times_missing" }];
  if (departsAt.getTime() === trip.stops[0]?.plannedAt.getTime()) return [];

  const problems: ChangeProblem[] = [
    ...checkTimes(times, trip.typicalS, now, settings).problems,
    ...stopsOutOfSeason(
      after.stops.map((stop) => stop.season),
      departsAt,
    ),
  ];
  if (trip.otherTrips.some((other) => overlaps({ departsAt, arrivesAt }, other))) {
    problems.push({ code: "overlaps_trip" });
  }
  if (bookings.length > 0) {
    const booked = bookings.map((booking) => booking.departsAtWhenBooked.getTime());
    const earliest = new Date(Math.max(...booked) - maxMoveMinutes * minuteMs);
    const latest = new Date(Math.min(...booked) + maxMoveMinutes * minuteMs);
    if (departsAt < earliest || departsAt > latest) {
      problems.push({ code: "move_too_far", earliest, latest });
    }
  }
  return problems;
}

function whoIsTold(
  trip: ChangeableTrip,
  change: TripChange,
  after: ChangeableTrip,
  bookings: readonly BookingOnTrip[],
): PassengerTold[] {
  const departsAt = after.stops[0]?.plannedAt ?? new Date(0);
  const tell = (
    event: PassengerTold["event"] | ((booking: BookingOnTrip) => PassengerTold["event"]),
  ) =>
    bookings
      .filter((booking) => booking.status !== "requested")
      .map((booking) => ({
        bookingId: booking.id,
        event: typeof event === "function" ? event(booking) : event,
        freeCancellation:
          booking.status === "confirmed" && movedFar(booking.departsAtWhenBooked, departsAt),
      }));
  switch (change.kind) {
    case "departure":
      if (departsAt.getTime() === trip.stops[0]?.plannedAt.getTime()) return [];
      return tell((booking) => ({
        type: "DepartureMoved",
        byMinutes: (departsAt.getTime() - booking.departsAtWhenBooked.getTime()) / minuteMs,
      }));
    case "vehicle":
      return change.vehicleId === trip.vehicleId ? [] : tell({ type: "TripChanged" });
    case "addStop":
    case "removeStop":
      return tell({ type: "TripChanged" });
    case "seats":
    case "priceLevel":
    case "bookingMode":
    case "details":
      return [];
  }
}
