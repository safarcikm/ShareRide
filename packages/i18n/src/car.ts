import type { CarColour } from "@shareride/domain";
import type { MessageKey, Translate } from "./translator.ts";

// A car as passengers read it, in the app and in reminders (spec 7, 3.5).

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

export interface CarFacts {
  readonly make: string;
  readonly model: string;
  readonly colour: CarColour;
}

/** "White Toyota Yaris"; without the colour when the driver chose "another colour". */
export function carText(t: Translate, car: CarFacts): string {
  const key = colourKeys[car.colour];
  if (key === null) return t("trip.carWithoutColour", { make: car.make, model: car.model });
  return t("trip.car", { colour: t(key), make: car.make, model: car.model });
}
