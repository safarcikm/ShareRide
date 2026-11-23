import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/button";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { spacing } from "@/theme/tokens";

/**
 * Sign in faster next time (spec 27, 3.7): once, after step 3, for a new
 * account with a verified email. "Add a password" opens Choose a password
 * at once, while the sign-in is fresh enough to be the proof; "Not now"
 * goes on to where sign-up goes. Both stay in Settings, Sign-in methods.
 */
export default function FasterScreen() {
  const { t } = useLanguage();
  return (
    <Screen>
      <Title>{t("signUp.faster.title")}</Title>
      <View style={styles.choices}>
        <Button
          label={t("signUp.faster.password")}
          onPress={() => {
            router.replace("/settings/password");
          }}
        />
        <Button
          variant="text"
          label={t("password.notNow")}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/");
          }}
        />
      </View>
      <Body>{t("signUp.faster.help")}</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({ choices: { gap: spacing.md, marginVertical: spacing.md } });
