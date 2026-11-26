import { describe, expect, it } from "vitest";
import { createTranslator } from "./translator.ts";

describe("what accepting a request holds (spec 31, 3.12)", () => {
  const stretch = { from: "Mjódd", to: "Selfoss" };

  it("counts the car's seats in the singular for a car with one", () => {
    const one = { taken: 1, seats: 1, ...stretch };
    expect(createTranslator("en")("request.ifAcceptedBusiest", one)).toBe(
      "If you accept, 1 of 1 seat is taken from Mjódd to Selfoss.",
    );
    expect(createTranslator("is")("request.ifAcceptedBusiest", one)).toBe(
      "Ef þú samþykkir er 1 af 1 sæti upptekið: Mjódd → Selfoss.",
    );
  });

  it("says the seats taken of the car's seats", () => {
    const two = { taken: 2, seats: 3, ...stretch };
    expect(createTranslator("en")("request.ifAcceptedBusiest", two)).toBe(
      "If you accept, 2 of 3 seats are taken from Mjódd to Selfoss.",
    );
    expect(createTranslator("is")("request.ifAcceptedBusiest", two)).toBe(
      "Ef þú samþykkir eru 2 af 3 sætum upptekin: Mjódd → Selfoss.",
    );
    expect(
      createTranslator("en")("request.ifAcceptedBusiest", { taken: 1, seats: 3, ...stretch }),
    ).toBe("If you accept, 1 of 3 seats is taken from Mjódd to Selfoss.");
  });
});
