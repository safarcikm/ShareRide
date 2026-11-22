import { router } from "expo-router";
import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { PageHead } from "@/components/page-head";
import { Row } from "@/components/row";
import { Screen } from "@/components/screen";
import { Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";

const documents = [
  { type: "terms", title: "legal.terms" },
  { type: "community-rules", title: "legal.rules" },
  { type: "privacy", title: "legal.privacy" },
] as const;

/** Terms, rules and privacy (spec 16, 3.4 item 2): the three legal documents. Open to everyone. */
export default function LegalDocumentsScreen() {
  const { t } = useLanguage();
  return (
    <Screen>
      <PageHead
        title={t("seo.title", { page: t("profile.legal") })}
        description={t("seo.legalDescription")}
      />
      <BackButton fallback="/profile" />
      <Title>{t("profile.legal")}</Title>
      <Card>
        {documents.map((document) => (
          <Row
            key={document.type}
            title={t(document.title)}
            onPress={() => {
              router.push({ pathname: "/legal/[type]", params: { type: document.type } });
            }}
          />
        ))}
      </Card>
    </Screen>
  );
}
