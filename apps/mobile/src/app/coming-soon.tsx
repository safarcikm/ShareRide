import { router } from "expo-router";
import { Button } from "@/components/button";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";

export default function ComingSoon() {
  const { t } = useLanguage();
  return (
    <Screen>
      <Title>{t("comingSoon.title")}</Title>
      <Body>{t("comingSoon.body")}</Body>
      <Button
        variant="secondary"
        label={t("common.back")}
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/");
        }}
      />
    </Screen>
  );
}
