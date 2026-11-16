import type { MyTrip, Quote } from "@shareride/contracts";
import { defaultTripSettings, noteMaxLength } from "@shareride/domain";
import type { Locale, MessageKey, Translate } from "@shareride/i18n";

export const luggageKeys = {
  small_bag: "trip.prefs.luggage.small_bag",
  suitcase: "trip.prefs.luggage.suitcase",
  by_arrangement: "trip.prefs.luggage.by_arrangement",
} as const satisfies Record<MyTrip["preferences"]["luggage"], MessageKey>;

export const petKeys = {
  no: "trip.prefs.pets.no",
  ask: "trip.prefs.pets.ask",
  yes: "trip.prefs.pets.yes",
} as const satisfies Record<MyTrip["preferences"]["pets"], MessageKey>;

export const smokingKeys = {
  no: "trip.prefs.smoking.no",
  breaks_outside: "trip.prefs.smoking.breaks_outside",
} as const satisfies Record<MyTrip["preferences"]["smoking"], MessageKey>;

export const chatKeys = {
  quiet: "trip.prefs.chat.quiet",
  some: "trip.prefs.chat.some",
  chatty: "trip.prefs.chat.chatty",
} as const satisfies Record<MyTrip["preferences"]["chat"], MessageKey>;

export const childSeatKey = (childSeat: boolean): MessageKey =>
  childSeat ? "trip.prefs.childSeat.yes" : "trip.prefs.childSeat.no";

export const bookingModeKeys = {
  approval: { title: "trip.bookingMode.approval", help: "trip.bookingMode.approvalHelp" },
  instant: { title: "trip.bookingMode.instant", help: "trip.bookingMode.instantHelp" },
} as const satisfies Record<MyTrip["bookingMode"], { title: MessageKey; help: MessageKey }>;

/** A price level as shown: "Free" at 0, otherwise "90%". */
export function levelText(t: Translate, level: number): string {
  return level === 0 ? t("trip.priceLevel.free") : `${String(level)}%`;
}

/** The trip's preferences in words, in the order of the seats step. */
export function preferenceTexts(t: Translate, preferences: MyTrip["preferences"]): string[] {
  return [
    t(luggageKeys[preferences.luggage]),
    t(petKeys[preferences.pets]),
    t(smokingKeys[preferences.smoking]),
    t(childSeatKey(preferences.childSeat)),
    t(chatKeys[preferences.chat]),
  ];
}

/** Every stop of the trip in order: "BSÍ → Borgarnes → Hof". */
export function stopsText(t: Translate, locale: Locale, trip: Pick<MyTrip, "stops">): string {
  const [first = "", ...rest] = trip.stops.map((stop) => stop.meetingPoint.name[locale]);
  return rest.reduce((route, name) => t("trip.stretch", { from: route, to: name }), first);
}

/** "BSÍ bus terminal → Hof, Akureyri": a trip's first and last stop. */
export function routeText(t: Translate, locale: Locale, trip: MyTrip): string {
  const first = trip.stops[0]?.meetingPoint.name[locale] ?? "";
  const last = trip.stops.at(-1)?.meetingPoint.name[locale] ?? "";
  return t("trip.stretch", { from: first, to: last });
}

type QuoteProblem = Quote["problems"][number]["code"];

/**
 * Codes the server gives when a trip cannot be published (spec 3, section
 * 4) or changed (spec 6, 3.2).
 */
export type ProblemCode =
  | QuoteProblem
  | "driver_not_ready"
  | "car_missing"
  | "seats_invalid"
  | "seats_below_taken"
  | "price_level_invalid"
  | "stop_unavailable"
  | "overlaps_trip"
  | "note_too_long"
  | "note_has_contact_details";

/** Problems told in a sentence of their own. */
const plainProblems = {
  driver_not_ready: "trip.problem.driver_not_ready",
  car_missing: "trip.problem.car_missing",
  seats_below_taken: "trip.problem.seats_below_taken",
  price_level_invalid: "trip.problem.price_level_invalid",
  times_missing: "trip.problem.times_missing",
  departure_too_soon: "trip.problem.departure_too_soon",
  departure_too_far: "trip.problem.departure_too_far",
  overlaps_trip: "trip.problem.overlaps_trip",
  too_few_stops: "trip.route.chooseBoth",
  route_too_long: "trip.route.tooLong",
  note_has_contact_details: "trip.noContactDetails",
} as const satisfies Partial<Record<ProblemCode, MessageKey>>;

/** Problems about one stop, which they name. */
const stopProblems = {
  stop_unavailable: "trip.problem.stop_unavailable",
  stop_repeated: "trip.problem.stop_repeated",
  stop_out_of_season: "trip.problem.stop_out_of_season",
  times_not_increasing: "trip.problem.times_not_increasing",
  stretch_too_fast: "trip.problem.stretch_too_fast",
} as const satisfies Partial<Record<ProblemCode, MessageKey>>;

const isIn = <T extends object>(code: string, keys: T): code is Extract<keyof T, string> =>
  Object.hasOwn(keys, code);

/**
 * What to fix, in words. `name` is the stop the problem is about: for a
 * stretch, the stop at its end.
 */
export function problemText(t: Translate, code: string, name: string): string {
  if (isIn(code, plainProblems)) return t(plainProblems[code]);
  if (isIn(code, stopProblems)) return t(stopProblems[code], { name });
  if (code === "seats_invalid") {
    return t("trip.problem.seats_invalid", { max: defaultTripSettings.maxSeats });
  }
  if (code === "note_too_long") return t("trip.note.tooLong", { max: noteMaxLength });
  return t("error.generic");
}

/** The stop a refusal's path names: `stops.N`, or the end of `segments.N`. */
export function stopNameAt(names: readonly string[], path: string): string {
  const [kind, position] = path.split(".");
  const index = Number(position);
  if (kind === "stops") return names[index] ?? "";
  if (kind === "segments") return names[index + 1] ?? "";
  return "";
}
