import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/button";
import { LanguageSwitch } from "@/components/language-switch";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { spacing } from "@/theme/tokens";

/** Welcome (spec 1, screen 1). Sign-in buttons arrive with phone sign-in. */
export default function Welcome() {
  const { t } = useLanguage();
  return (
    <Screen>
      <View style={styles.top}>
        <LanguageSwitch />
      </View>
      <View style={styles.middle}>
        <Title>{t("welcome.title")}</Title>
        <Body>{t("welcome.tagline")}</Body>
      </View>
      <Button
        label={t("welcome.browseTrips")}
        onPress={() => {
          router.push("/coming-soon");
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: "flex-end" },
  middle: { flex: 1, justifyContent: "center", gap: spacing.md },
});
