import {
  createTranslator,
  isLocale,
  pickLocale,
  type Locale,
  type Translate,
} from "@shareride/i18n";
import { getLocales } from "expo-localization";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { readPreference, writePreference } from "@/lib/preferences";
import { localeFromQuery } from "@/seo/address";

const storageKey = "language";

interface LanguageContextValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: Translate;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function deviceLocale(): Locale {
  return pickLocale(getLocales().map((locale) => locale.languageTag));
}

/** On the web, the language the address names with `?lang=` (spec 23, 3.5). */
function addressLocale(): Locale | null {
  if (Platform.OS !== "web") return null;
  try {
    return localeFromQuery(globalThis.location.search);
  } catch {
    return null;
  }
}

/**
 * The app language: the device's language if Icelandic or English, otherwise
 * English, until the person picks one; the choice is saved on the device.
 * On the web an address with `?lang=is` or `?lang=en`, as search engines
 * list them, opens in that language for the visit, before a saved choice
 * (spec 23, 3.5); picking one still saves it.
 */
export function LanguageProvider({ children }: { readonly children: ReactNode }) {
  const [named] = useState(addressLocale);
  const [locale, setLocaleState] = useState<Locale>(() => named ?? deviceLocale());

  useEffect(() => {
    if (named !== null) return undefined;
    let active = true;
    void readPreference(storageKey).then((saved) => {
      if (active && saved !== null && isLocale(saved)) setLocaleState(saved);
    });
    return () => {
      active = false;
    };
  }, [named]);

  useEffect(() => {
    // Screen readers on the web pick their voice from the page language.
    if (Platform.OS === "web") document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      t: createTranslator(locale),
      setLocale: (next) => {
        setLocaleState(next);
        void writePreference(storageKey, next);
      },
    }),
    [locale],
  );

  return <LanguageContext value={value}>{children}</LanguageContext>;
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (value === null) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}
