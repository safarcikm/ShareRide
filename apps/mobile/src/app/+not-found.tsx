import { Button } from "@/components/button";
import { NoIndex } from "@/components/no-index";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { useLanguage } from "@/i18n/language";

/**
 * An address the app does not have (spec 31, 3.21): an old link, or one
 * with a mistake in it. It says so with the title at the left, and the way
 * on is the main button in the bar, to Find. Without this page the router
 * shows its own: black, in English, with a list of every address. Open to
 * everyone, signed in or out, and not for search engines.
 */
export default function NotFoundScreen() {
  const { t } = useLanguage();
  return (
    <Screen siteFooter footer={<Button main label={t("welcome.findRide")} href="/" />}>
      <NoIndex />
      <ScreenHead title={t("notFound.title")} line={t("notFound.line")} />
    </Screen>
  );
}
