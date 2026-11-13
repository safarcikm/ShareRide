import { IntlMessageFormat } from "intl-messageformat";
import type { Locale } from "./locales.ts";
import { en, type MessageKey } from "./messages/en.ts";
import { is } from "./messages/is.ts";

export type { MessageKey };

export type MessageValues = Readonly<Record<string, string | number | Date>>;

export type Translate = (key: MessageKey, values?: MessageValues) => string;

const catalogs: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = { en, is };

/** Returns `t(key, values)` for one language. Parsed messages are cached. */
export function createTranslator(locale: Locale): Translate {
  const cache = new Map<MessageKey, IntlMessageFormat>();
  return (key, values) => {
    let format = cache.get(key);
    if (format === undefined) {
      format = new IntlMessageFormat(catalogs[locale][key], locale);
      cache.set(key, format);
    }
    return String(format.format(values));
  };
}
