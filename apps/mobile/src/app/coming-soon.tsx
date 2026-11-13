import { BackButton } from "@/components/back-button";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";

export default function ComingSoon() {
  const { t } = useLanguage();
  return (
    <Screen>
      <BackButton />
      <Title>{t("comingSoon.title")}</Title>
      <Body>{t("comingSoon.body")}</Body>
    </Screen>
  );
}
