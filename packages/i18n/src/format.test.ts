import { describe, expect, it } from "vitest";
import { formatMoney } from "./format.ts";

describe("formatMoney (ADR 0011)", () => {
  it("shows whole krónur in Icelandic as 2.500 kr.", () => {
    expect(formatMoney({ amount: 2500, currency: "ISK" }, "is")).toBe("2.500 kr.");
  });

  it("shows whole krónur in English as 2,500 ISK", () => {
    expect(formatMoney({ amount: 2500, currency: "ISK" }, "en")).toBe("2,500 ISK");
  });

  it("shows a free trip as 0", () => {
    expect(formatMoney({ amount: 0, currency: "ISK" }, "en")).toBe("0 ISK");
  });
});
