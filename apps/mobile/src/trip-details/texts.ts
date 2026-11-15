import type { TripDetails } from "@shareride/contracts";
import type { CarColour } from "@shareride/domain";
import type { MessageKey, Translate } from "@shareride/i18n";

type Preferences = TripDetails["preferences"];

/** The driver's preferences as a passenger reads them (spec 4, 3.6.5). */
export const needKeys = {
  luggage: {
    small_bag: "trip.needs.luggage.small_bag",
    suitcase: "trip.needs.luggage.suitcase",
    by_arrangement: "trip.needs.luggage.by_arrangement",
  },
  pets: { no: "trip.needs.pets.no", ask: "trip.needs.pets.ask", yes: "trip.needs.pets.yes" },
  smoking: { no: "trip.needs.smoking.no", breaks_outside: "trip.needs.smoking.breaks_outside" },
  chat: {
    quiet: "trip.needs.chat.quiet",
    some: "trip.needs.chat.some",
    chatty: "trip.needs.chat.chatty",
  },
} as const satisfies {
  readonly [K in Exclude<keyof Preferences, "childSeat">]: Record<Preferences[K], MessageKey>;
};

export const childSeatNeedKey = (childSeat: boolean): MessageKey =>
  childSeat ? "trip.needs.childSeat.yes" : "trip.needs.childSeat.no";

const colourKeys = {
  white: "vehicle.colour.white",
  black: "vehicle.colour.black",
  grey: "vehicle.colour.grey",
  silver: "vehicle.colour.silver",
  blue: "vehicle.colour.blue",
  red: "vehicle.colour.red",
  green: "vehicle.colour.green",
  yellow: "vehicle.colour.yellow",
  brown: "vehicle.colour.brown",
  beige: "vehicle.colour.beige",
  orange: "vehicle.colour.orange",
  other: null,
} as const satisfies Record<CarColour, MessageKey | null>;

/** "White Toyota Yaris"; without the colour when the driver chose "another colour". */
export function carText(t: Translate, car: NonNullable<TripDetails["car"]>): string {
  const key = colourKeys[car.colour];
  if (key === null) return t("trip.carWithoutColour", { make: car.make, model: car.model });
  return t("trip.car", { colour: t(key), make: car.make, model: car.model });
}
