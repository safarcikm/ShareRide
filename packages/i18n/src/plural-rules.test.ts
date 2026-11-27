import { afterEach, describe, expect, it } from "vitest";
import { locales } from "./locales.ts";
import { ensurePluralRules, pluralCategory } from "./plural-rules.ts";
import { createTranslator } from "./translator.ts";

// Node carries full ICU data, so its Intl.PluralRules is the reference the
// app's own rules must match.
const reference = Intl.PluralRules;

const numbers = [
  ...Array.from({ length: 1201 }, (_, n) => n),
  ...[-1, -2, -11, -21],
  ...[0.1, 0.5, 1.1, 1.5, 1.01, 1.0001, 2.1, 2.25, 10.1, 11.1, 21.1, 21.21, 0.11, 0.21, 101.31],
];

describe("pluralCategory", () => {
  for (const locale of locales) {
    for (const type of ["cardinal", "ordinal"] as const) {
      it(`picks the same ${type} category as full ICU data in ${locale}`, () => {
        const rules = new reference(locale, { type });
        for (const n of numbers) {
          expect([n, pluralCategory(locale, type, n)]).toEqual([n, rules.select(n)]);
        }
      });
    }
  }

  it("treats what is not a number as other", () => {
    expect(pluralCategory("is", "cardinal", Number.NaN)).toBe("other");
    expect(pluralCategory("en", "cardinal", Number.POSITIVE_INFINITY)).toBe("other");
  });
});

// Hermes, the engine of the iOS and Android app, has no Intl.PluralRules.
describe("on an engine without Intl.PluralRules", () => {
  const withoutPluralRules = () => {
    Object.defineProperty(Intl, "PluralRules", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  };
  afterEach(() => {
    Object.defineProperty(Intl, "PluralRules", {
      value: reference,
      writable: true,
      configurable: true,
    });
  });

  it("gives Intl the app's own plural rules", () => {
    withoutPluralRules();
    ensurePluralRules();
    expect(new Intl.PluralRules("is").select(21)).toBe("one");
    expect(new Intl.PluralRules("is-IS").select(11)).toBe("other");
    expect(new Intl.PluralRules(["en"], { type: "ordinal" }).select(22)).toBe("two");
    expect(Intl.PluralRules.supportedLocalesOf(["pl", "is-IS", "en"])).toEqual(["is-IS", "en"]);
  });

  it("leaves an engine's own plural rules alone", () => {
    ensurePluralRules();
    expect(Intl.PluralRules).toBe(reference);
  });

  it("still writes texts with plurals in both languages", () => {
    withoutPluralRules();
    expect(createTranslator("is")("search.tripCount", { count: 21 })).toBe("21 ferð");
    expect(createTranslator("is")("search.tripCount", { count: 11 })).toBe("11 ferðir");
    expect(createTranslator("en")("search.tripCount", { count: 1 })).toBe("1 ride");
    expect(createTranslator("en")("search.tripCount", { count: 2 })).toBe("2 rides");
  });
});
