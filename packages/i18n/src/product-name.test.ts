import { describe, expect, it } from "vitest";
import { en } from "./messages/en.ts";
import { is } from "./messages/is.ts";

// The product is PuffinRide (ADR 0039). Message keys may keep the old name,
// such as `notify.cancelledByShareRide`; what people read may not.
describe("the product's name", () => {
  it("is PuffinRide in both languages", () => {
    expect(en["app.name"]).toBe("PuffinRide");
    expect(is["app.name"]).toBe("PuffinRide");
  });

  it.each([
    ["en", en],
    ["is", is],
  ])("never appears as the old name in the %s texts", (_, messages) => {
    const old = Object.entries(messages).filter(([, text]) => /share\s*ride/i.test(text));
    expect(old.map(([key]) => key)).toEqual([]);
  });
});
