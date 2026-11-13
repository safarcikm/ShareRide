import { useLanguage } from "@/i18n/language";
import { Button } from "./button";

/** Switches between Icelandic and English (spec 1, section 3.1). */
export function LanguageSwitch() {
  const { locale, setLocale, t } = useLanguage();
  return (
    <Button
      variant="secondary"
      label={t("language.switch")}
      accessibilityLabel={t("language.switchLabel")}
      onPress={() => {
        setLocale(locale === "is" ? "en" : "is");
      }}
    />
  );
}
