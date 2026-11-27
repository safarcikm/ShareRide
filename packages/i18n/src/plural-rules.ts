// Hermes, the JavaScript engine of the iOS and Android app, has no
// Intl.PluralRules, and the texts' ICU plurals need it: without it every
// text with a count throws, and the app's front page fails. The rules of
// our two languages are a few lines of CLDR, so they live here, like the
// month names and digit marks (ADR 0025), and the tests hold them to Node's
// full ICU data. Polish (Phase 5) needs its rules added here.
import { isLocale, pickLocale, type Locale } from "./locales.ts";

export type PluralType = "cardinal" | "ordinal";
export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

/**
 * CLDR's operands of a number as Intl.PluralRules sees it by default, shown
 * with at most three decimals: n the number, i its whole part, t its
 * visible decimals as a whole number (1.5 has t = 5, 1.25 has t = 25).
 */
function operands(value: number): { n: number; i: number; t: number } {
  const [whole = "0", decimals = ""] = Math.abs(value).toFixed(3).split(".");
  const visible = decimals.replace(/0+$/, "");
  return { n: Number(`${whole}.${visible || "0"}`), i: Number(whole), t: Number(visible || "0") };
}

/** The plural category of a number in one of our languages (CLDR rules). */
export function pluralCategory(locale: Locale, type: PluralType, value: number): PluralCategory {
  if (!Number.isFinite(value)) return "other";
  const { n, i, t } = operands(value);
  if (locale === "is") {
    // Icelandic has one ordinal form; cardinal "one" ends in 1, not 11.
    if (type === "ordinal") return "other";
    const endsInOne = (digits: number) => digits % 10 === 1 && digits % 100 !== 11;
    return (t === 0 && endsInOne(i)) || endsInOne(t) ? "one" : "other";
  }
  if (type === "cardinal") return i === 1 && t === 0 ? "one" : "other";
  if (n % 10 === 1 && n % 100 !== 11) return "one";
  if (n % 10 === 2 && n % 100 !== 12) return "two";
  if (n % 10 === 3 && n % 100 !== 13) return "few";
  return "other";
}

const tagsOf = (locales: string | readonly string[] | undefined): readonly string[] =>
  locales === undefined ? [] : typeof locales === "string" ? [locales] : locales;

const languageOf = (tag: string): string => tag.split("-")[0]?.toLowerCase() ?? "";

/** The part of Intl.PluralRules that intl-messageformat uses, for our languages. */
class OwnPluralRules {
  readonly #locale: Locale;
  readonly #type: PluralType;

  constructor(locales?: string | readonly string[], options?: { readonly type?: PluralType }) {
    this.#locale = pickLocale(tagsOf(locales));
    this.#type = options?.type ?? "cardinal";
  }

  select(value: number): PluralCategory {
    return pluralCategory(this.#locale, this.#type, value);
  }

  resolvedOptions(): { locale: Locale; type: PluralType } {
    return { locale: this.#locale, type: this.#type };
  }

  static supportedLocalesOf(locales: string | readonly string[]): string[] {
    return tagsOf(locales).filter((tag) => isLocale(languageOf(tag)));
  }
}

/** Gives Intl our plural rules where the engine has none (Hermes). */
export function ensurePluralRules(): void {
  if (typeof Intl.PluralRules === "function") return;
  Object.defineProperty(Intl, "PluralRules", {
    value: OwnPluralRules,
    writable: true,
    configurable: true,
  });
}
