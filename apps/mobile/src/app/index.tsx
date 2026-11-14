import { Redirect, router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { nextRoute } from "@/auth/next-route";
import { useSessionState } from "@/auth/session";
import { Button } from "@/components/button";
import { LanguageSwitch } from "@/components/language-switch";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { spacing } from "@/theme/tokens";

/**
 * Welcome (spec 1, screen 1). Signed-in people go on to the next step of
 * signing up, or to their profile. Apple and Google sign-in come in
 * milestone 2.
 */
export default function Welcome() {
  const { t } = useLanguage();
  const state = useSessionState();
  if (state.status === "signedIn") return <Redirect href={nextRoute(state.me)} />;
  return (
    <Screen>
      <View style={styles.top}>
        <LanguageSwitch />
      </View>
      <View style={styles.middle}>
        <Title>{t("welcome.title")}</Title>
        <Body>{t("welcome.tagline")}</Body>
      </View>
      <View style={styles.actions}>
        <Button
          label={t("welcome.continuePhone")}
          onPress={() => {
            router.push("/sign-in");
          }}
        />
        <Button
          variant="secondary"
          label={t("welcome.browseTrips")}
          onPress={() => {
            router.push("/coming-soon");
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "flex-end" },
  middle: { flex: 1, justifyContent: "center", gap: spacing.md },
  actions: { gap: spacing.sm },
});
