import { describe, expect, it } from "vitest";
import { addMoney, createMoney, multiplyMoney } from "./money.ts";

describe("createMoney", () => {
  it("accepts a whole number of krónur", () => {
    expect(createMoney(2500, "ISK")).toEqual({
      ok: true,
      value: { amount: 2500, currency: "ISK" },
    });
  });

  it("accepts zero, for free trips", () => {
    expect(createMoney(0, "ISK")).toEqual({ ok: true, value: { amount: 0, currency: "ISK" } });
  });

  it("rejects a fractional amount, because ISK has no minor unit", () => {
    expect(createMoney(2500.5, "ISK")).toEqual({
      ok: false,
      error: { code: "amount_not_integer", amount: 2500.5 },
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])("rejects %s", (amount) => {
    expect(createMoney(amount, "ISK")).toMatchObject({
      ok: false,
      error: { code: "amount_not_integer" },
    });
  });

  it("rejects an amount too large to count exactly", () => {
    expect(createMoney(Number.MAX_SAFE_INTEGER + 1, "ISK")).toMatchObject({
      ok: false,
      error: { code: "amount_out_of_range" },
    });
  });
});

describe("addMoney", () => {
  it("adds two amounts in the same currency", () => {
    expect(addMoney({ amount: 1200, currency: "ISK" }, { amount: 1300, currency: "ISK" })).toEqual({
      ok: true,
      value: { amount: 2500, currency: "ISK" },
    });
  });

  it("rejects mixed currencies", () => {
    // EUR is not supported yet; the cast stands in for a second currency.
    const euros = { amount: 10, currency: "EUR" } as unknown as Parameters<typeof addMoney>[1];
    expect(addMoney({ amount: 1200, currency: "ISK" }, euros)).toEqual({
      ok: false,
      error: { code: "currency_mismatch", currencies: ["ISK", "EUR"] },
    });
  });

  it("rejects a sum too large to count exactly", () => {
    expect(
      addMoney(
        { amount: Number.MAX_SAFE_INTEGER, currency: "ISK" },
        { amount: 1, currency: "ISK" },
      ),
    ).toMatchObject({ ok: false, error: { code: "amount_out_of_range" } });
  });
});

describe("multiplyMoney", () => {
  it("multiplies a price by a number of seats", () => {
    expect(multiplyMoney({ amount: 1800, currency: "ISK" }, 3)).toEqual({
      ok: true,
      value: { amount: 5400, currency: "ISK" },
    });
  });

  it("rejects a fractional factor", () => {
    expect(multiplyMoney({ amount: 1800, currency: "ISK" }, 1.5)).toEqual({
      ok: false,
      error: { code: "factor_not_integer", factor: 1.5 },
    });
  });

  it("rejects a product too large to count exactly", () => {
    expect(multiplyMoney({ amount: Number.MAX_SAFE_INTEGER, currency: "ISK" }, 2)).toMatchObject({
      ok: false,
      error: { code: "amount_out_of_range" },
    });
  });
});
