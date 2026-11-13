import { callingCode, supportedCountries, type SupportedCountry } from "@shareride/domain";
import { countryNames } from "@shareride/i18n";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { BackButton } from "@/components/back-button";
import { Screen } from "@/components/screen";
import { Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useSignInFlow } from "@/sign-in/flow";
import { minTouchTarget, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** The country of the phone number: Iceland first, then the rest by name. */
export default function CountryPicker() {
  const { locale, t } = useLanguage();
  const flow = useSignInFlow();
  const palette = usePalette();
  const countries = useMemo(() => {
    const names = countryNames[locale];
    const [iceland, ...others] = supportedCountries;
    const sorted = [...others].sort((a, b) => names[a].localeCompare(names[b], locale));
    return [iceland, ...sorted];
  }, [locale]);

  function choose(country: SupportedCountry) {
    flow.setCountry(country);
    if (router.canGoBack()) router.back();
    else router.replace("/sign-in");
  }

  return (
    <Screen>
      <BackButton fallback="/sign-in" />
      <Title>{t("auth.phone.chooseCountry")}</Title>
      {countries.map((country) => {
        const name = countryNames[locale][country];
        const code = callingCode(country);
        const selected = country === flow.country;
        return (
          <Pressable
            key={country}
            accessibilityRole="button"
            accessibilityLabel={`${name}, +${code}`}
            accessibilityState={{ selected }}
            onPress={() => {
              choose(country);
            }}
            style={[styles.row, { borderColor: palette.border }]}
          >
            <Text style={[typography.body, styles.name, { color: palette.text }]}>
              {selected ? "✓ " : ""}
              {name}
            </Text>
            <Text style={[typography.body, { color: palette.textMuted }]}>+{code}</Text>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { flex: 1 },
});
