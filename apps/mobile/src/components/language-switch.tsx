import type { Locale } from "@shareride/i18n";
import { useLanguage } from "@/i18n/language";
import { Button } from "./button";

/** Switches between Icelandic and English (spec 1, section 3.1). */
export function LanguageSwitch({
  onSwitch,
}: {
  /** Called with the new language, after the app has switched. */
  readonly onSwitch?: (locale: Locale) => void;
}) {
  const { locale, setLocale, t } = useLanguage();
  return (
    <Button
      variant="text"
      label={t("language.switch")}
      accessibilityLabel={t("language.switchLabel")}
      onPress={() => {
        const next = locale === "is" ? "en" : "is";
        setLocale(next);
        onSwitch?.(next);
      }}
    />
  );
}
