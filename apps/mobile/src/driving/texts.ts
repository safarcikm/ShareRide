import type { Vehicle } from "@shareride/contracts";
import { inIceland, type CarColour } from "@shareride/domain";
import { formatDate, type Locale, type MessageKey, type Translate } from "@shareride/i18n";

export const colourKeys = {
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
  other: "vehicle.colour.other",
} as const satisfies Record<CarColour, MessageKey>;

/** "Toyota Yaris, white": the colour in lower case, as inside a sentence. */
export function carSummary(t: Translate, locale: Locale, car: Vehicle): string {
  return t("vehicle.summary", {
    make: car.make,
    model: car.model,
    colour: t(colourKeys[car.colour]).toLocaleLowerCase(locale),
  });
}

/** The day of a moment in Iceland, such as "14 November 2026". */
export function dayInIceland(moment: string, locale: Locale): string {
  const { year, month, day } = inIceland(new Date(moment));
  const pad = (value: number) => String(value).padStart(2, "0");
  return formatDate(`${String(year)}-${pad(month)}-${pad(day)}`, locale);
}
