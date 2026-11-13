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

/**
 * The app language: the device's language if Icelandic or English, otherwise
 * English, until the person picks one; the choice is saved on the device.
 */
export function LanguageProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);

  useEffect(() => {
    let active = true;
    void readPreference(storageKey).then((saved) => {
      if (active && saved !== null && isLocale(saved)) setLocaleState(saved);
    });
    return () => {
      active = false;
    };
  }, []);

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
