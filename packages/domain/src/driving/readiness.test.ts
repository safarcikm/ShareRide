import { describe, expect, it } from "vitest";
import { driverReadiness } from "./readiness.ts";

const ready = { accountComplete: true, hasPhoto: true, hasCar: true, licenceDeclared: true };

describe("driverReadiness (spec 3, 3.1 and rule R3.1)", () => {
  it("lists the photo, the car and the licence, in that order", () => {
    expect(driverReadiness(ready)).toEqual({
      ready: true,
      items: [
        { item: "photo", done: true, blocking: false },
        { item: "car", done: true, blocking: true },
        { item: "licence", done: true, blocking: true },
      ],
    });
  });

  it("needs a car and the licence declaration", () => {
    expect(driverReadiness({ ...ready, hasCar: false }).ready).toBe(false);
    expect(driverReadiness({ ...ready, licenceDeclared: false }).ready).toBe(false);
  });

  it("shows a missing photo without blocking until photos can be added (decision 2)", () => {
    const readiness = driverReadiness({ ...ready, hasPhoto: false });
    expect(readiness.ready).toBe(true);
    expect(readiness.items[0]).toEqual({ item: "photo", done: false, blocking: false });
  });

  it("needs the account finished: phone verified and current terms accepted", () => {
    expect(driverReadiness({ ...ready, accountComplete: false }).ready).toBe(false);
  });
});
