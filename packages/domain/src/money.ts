import { err, ok, type Result } from "./result.ts";

/**
 * Supported currencies and their ISO 4217 minor units. ISK has none, so an
 * amount of 2500 is 2 500 kr. Add a currency here only together with an ADR.
 */
export const currencies = {
  ISK: { minorUnitDigits: 0 },
} as const;

export type CurrencyCode = keyof typeof currencies;

/** An integer amount in the currency's minor unit. Never a float. */
export interface Money {
  readonly amount: number;
  readonly currency: CurrencyCode;
}

export type MoneyError =
  | { readonly code: "amount_not_integer"; readonly amount: number }
  | { readonly code: "amount_out_of_range"; readonly amount: number }
  | { readonly code: "factor_not_integer"; readonly factor: number }
  | {
      readonly code: "currency_mismatch";
      readonly currencies: readonly [CurrencyCode, CurrencyCode];
    };

export function createMoney(amount: number, currency: CurrencyCode): Result<Money, MoneyError> {
  if (!Number.isInteger(amount)) {
    return err({ code: "amount_not_integer", amount });
  }
  if (!Number.isSafeInteger(amount)) {
    return err({ code: "amount_out_of_range", amount });
  }
  return ok({ amount, currency });
}

export function addMoney(a: Money, b: Money): Result<Money, MoneyError> {
  // Only ISK exists today, so TypeScript sees this as always false. It still
  // guards values read at run time and the next currency we add.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (a.currency !== b.currency) {
    return err({ code: "currency_mismatch", currencies: [a.currency, b.currency] });
  }
  return createMoney(a.amount + b.amount, a.currency);
}

/** Multiplies by a whole number, for example a segment price by seats. */
export function multiplyMoney(money: Money, factor: number): Result<Money, MoneyError> {
  if (!Number.isInteger(factor)) {
    return err({ code: "factor_not_integer", factor });
  }
  return createMoney(money.amount * factor, money.currency);
}
