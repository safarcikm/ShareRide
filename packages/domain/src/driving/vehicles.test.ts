import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { carColours, normalisePlate, validateVehicle, vehicleRules } from "./vehicles.ts";

const car = { make: "Toyota", model: "Yaris", colour: "white", registration: null } as const;

// Plates of 7 or 8 characters, which Iceland does not issue, so none is real.

describe("normalisePlate (spec 3, 3.2.4)", () => {
  it("keeps capitals and digits only", () => {
    expect(normalisePlate("test-0001")).toBe("TEST0001");
    expect(normalisePlate(" te st 001 ")).toBe("TEST001");
    expect(normalisePlate("þór-test")).toBe("ÞÓRTEST");
  });

  it("joins letters typed as a letter and an accent", () => {
    const decomposed = "ÞÓRTEST".normalize("NFD");
    expect(decomposed).not.toBe("ÞÓRTEST");
    expect(normalisePlate(decomposed)).toBe("ÞÓRTEST");
  });

  it("changes nothing the second time", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme" }), (text) => {
        expect(normalisePlate(normalisePlate(text))).toBe(normalisePlate(text));
      }),
    );
  });
});

describe("validateVehicle (spec 3, 3.2)", () => {
  it("accepts a car without a number plate", () => {
    expect(validateVehicle(car)).toEqual({ ok: true, value: car });
  });

  it("trims the make and model and stores the plate in capitals", () => {
    expect(
      validateVehicle({ ...car, make: "  Kia ", model: " Ceed SW ", registration: "test-0001" }),
    ).toEqual({
      ok: true,
      value: { ...car, make: "Kia", model: "Ceed SW", registration: "TEST0001" },
    });
  });

  it("stores accented letters in one form, however they were typed", () => {
    expect(
      validateVehicle({
        ...car,
        make: "Škoda".normalize("NFD"),
        model: "Fabia Ævintýri".normalize("NFD"),
        registration: "þórtest".normalize("NFD"),
      }),
    ).toEqual({
      ok: true,
      value: { ...car, make: "Škoda", model: "Fabia Ævintýri", registration: "ÞÓRTEST" },
    });
  });

  it("treats an empty plate as one to add later", () => {
    expect(validateVehicle({ ...car, registration: " - " })).toEqual({ ok: true, value: car });
  });

  it.each([
    [{ make: " " }, "make"],
    [{ make: "x".repeat(vehicleRules.nameMaxLength + 1) }, "make"],
    [{ model: "" }, "model"],
    [{ colour: "plaid" }, "colour"],
    [{ registration: "A" }, "registration"],
    [{ registration: "ABC123456" }, "registration"],
    [{ registration: "AB.123" }, "registration"],
  ])("names the field that is wrong: %o", (change, field) => {
    expect(validateVehicle({ ...car, ...change })).toEqual({
      ok: false,
      error: { code: "vehicle_invalid", field },
    });
  });

  it("knows a fixed list of colours", () => {
    expect(carColours).toContain("white");
    expect(carColours.at(-1)).toBe("other");
  });
});
