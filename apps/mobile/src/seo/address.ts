import { isLocale, locales, type Locale } from "@shareride/i18n";

/**
 * The language an address names with `?lang=is` or `?lang=en` (spec 23,
 * 3.5), from its query (`location.search`); null without a known one.
 */
export function localeFromQuery(search: string): Locale | null {
  const value = new URLSearchParams(search).get("lang");
  return value !== null && isLocale(value) ? value : null;
}

export interface PageLinks {
  /** The page's own address in the language shown: what search engines keep. */
  readonly canonical: string;
  /** Each language's address, then the plain one that follows the browser. */
  readonly alternates: readonly { readonly hreflang: string; readonly href: string }[];
}

/**
 * A public page's addresses (3.5), as the server names them: its own, in
 * the language the address named or plain, and the alternates. Never the
 * query's other parts.
 */
export function pageLinks(origin: string, pathname: string, named: Locale | null): PageLinks {
  const address = (lang: Locale | null) =>
    `${origin}${pathname}${lang === null ? "" : `?lang=${lang}`}`;
  return {
    canonical: address(named),
    alternates: [
      ...locales.map((lang) => ({ hreflang: lang, href: address(lang) })),
      { hreflang: "x-default", href: address(null) },
    ],
  };
}
