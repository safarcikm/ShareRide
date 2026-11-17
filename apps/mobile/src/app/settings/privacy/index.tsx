import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useMe } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { Row } from "@/components/row";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { BackToMenu } from "@/navigation/back-to-menu";
import { spacing } from "@/theme/tokens";

/**
 * Privacy in Settings (spec 11; plan 4.9): Download my data, Delete my
 * account, Ask about my data and the privacy policy.
 */
export default function PrivacyScreen() {
  const { t } = useLanguage();
  const me = useMe();
  if (me === null) return <BackToMenu />;
  return (
    <Screen>
      <BackButton fallback="/settings" />
      <Title>{t("privacy.title")}</Title>
      <Body>{t("privacy.intro")}</Body>
      <View style={styles.rows}>
        <Card>
          <Row
            title={t("privacy.download")}
            onPress={() => {
              router.push("/settings/privacy/download");
            }}
          />
          <Row
            title={t("privacy.delete")}
            onPress={() => {
              router.push("/settings/privacy/delete");
            }}
          />
          <Row
            title={t("privacy.ask")}
            onPress={() => {
              router.push("/settings/privacy/ask");
            }}
          />
          <Row
            title={t("legal.privacy")}
            onPress={() => {
              router.push("/legal/privacy");
            }}
          />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ rows: { marginTop: spacing.md } });
