// Cars (spec 3, section 3.2): any car the driver may use, described by make,
// model and colour; the number plate can come later.
import { err, ok, type Result } from "../result.ts";

/** Colours a driver picks from; the app shows them in both languages. */
export const carColours = [
  "white",
  "black",
  "grey",
  "silver",
  "blue",
  "red",
  "green",
  "yellow",
  "brown",
  "beige",
  "orange",
  "other",
] as const;
export type CarColour = (typeof carColours)[number];

/**
 * Makes the app suggests as the driver types; any other make can be typed
 * (plan for milestone 3, section 4.2). Common makes on Icelandic roads.
 */
export const commonCarMakes = [
  "Audi",
  "BMW",
  "BYD",
  "Dacia",
  "Ford",
  "Honda",
  "Hyundai",
  "Jeep",
  "Kia",
  "Land Rover",
  "Mazda",
  "Mercedes-Benz",
  "MG",
  "Mitsubishi",
  "Nissan",
  "Peugeot",
  "Polestar",
  "Renault",
  "Skoda",
  "Subaru",
  "Suzuki",
  "Tesla",
  "Toyota",
  "Volkswagen",
  "Volvo",
] as const;

export const vehicleRules = {
  /** Make and model, in characters. */
  nameMaxLength: 40,
  plateMinLength: 2,
  plateMaxLength: 8,
} as const;

export interface VehicleInput {
  readonly make: string;
  readonly model: string;
  readonly colour: string;
  /** Empty or null: added later, before departure (decision 4). */
  readonly registration: string | null;
}

export interface ValidVehicle {
  readonly make: string;
  readonly model: string;
  readonly colour: CarColour;
  readonly registration: string | null;
}

export interface VehicleError {
  readonly code: "vehicle_invalid";
  readonly field: "make" | "model" | "colour" | "registration";
}

/**
 * A number plate as stored: capitals, without spaces or hyphens (spec 3,
 * 3.2.4). An accented letter typed as a letter and an accent becomes one
 * letter (NFC), before and after the change to capitals.
 */
export function normalisePlate(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\s\-‐‑–]/gu, "")
    .toUpperCase()
    .normalize("NFC");
}

/** A make or model as stored: trimmed, with accented letters in one form (NFC). */
const tidyName = (name: string) => name.normalize("NFC").trim();

const isColour = (colour: string): colour is CarColour =>
  carColours.some((known) => known === colour);

const plateFormat = new RegExp(
  `^[\\p{Lu}\\d]{${String(vehicleRules.plateMinLength)},${String(vehicleRules.plateMaxLength)}}$`,
  "u",
);

const nameFits = (name: string) =>
  name.length > 0 && Array.from(name).length <= vehicleRules.nameMaxLength;

/** Checks a car the driver adds or edits, and tidies it for storing. */
export function validateVehicle(input: VehicleInput): Result<ValidVehicle, VehicleError> {
  const make = tidyName(input.make);
  const model = tidyName(input.model);
  if (!nameFits(make)) return err({ code: "vehicle_invalid", field: "make" });
  if (!nameFits(model)) return err({ code: "vehicle_invalid", field: "model" });
  if (!isColour(input.colour)) return err({ code: "vehicle_invalid", field: "colour" });
  const plate = normalisePlate(input.registration ?? "");
  if (plate !== "" && !plateFormat.test(plate)) {
    return err({ code: "vehicle_invalid", field: "registration" });
  }
  return ok({ make, model, colour: input.colour, registration: plate === "" ? null : plate });
}
