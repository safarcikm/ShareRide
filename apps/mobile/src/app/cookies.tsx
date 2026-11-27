import { StyleSheet, View } from "react-native";
import { useAnalytics } from "@/analytics/analytics";
import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { PageHead } from "@/components/page-head";
import { Screen } from "@/components/screen";
import { Switch } from "@/components/switch";
import { Body, Title } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { spacing } from "@/theme/tokens";

/**
 * Cookies (spec 23, 3.2), open to everyone: what the site keeps to work,
 * and, on a website with Google Analytics, the switch to count visits. On
 * is accepting; off stops it at once and removes Google's cookies (R23.4).
 * The phone apps, and a site without it, count no visits.
 */
export default function CookiesScreen() {
  const { t } = useLanguage();
  const { available, choice, choose } = useAnalytics();
  return (
    <Screen siteFooter>
      <PageHead
        title={t("seo.title", { page: t("cookies.title") })}
        description={t("seo.cookiesDescription")}
      />
      <BackButton fallback="/about" />
      <Title>{t("cookies.title")}</Title>
      <Body align="start">{t("cookies.needed")}</Body>
      {available ? (
        <Card>
          <View style={styles.analytics}>
            <Switch
              label={t("cookies.analytics")}
              value={choice === "accepted"}
              onChange={(on) => {
                choose(on ? "accepted" : "declined");
              }}
            />
            <Body align="start">{t("cookies.analyticsHelp")}</Body>
          </View>
        </Card>
      ) : (
        <Body align="start">{t("cookies.none")}</Body>
      )}
      <TextLink
        label={t("legal.readPrivacy")}
        href={{ pathname: "/legal/[type]", params: { type: "privacy" } }}
        align="start"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ analytics: { gap: spacing.sm } });
