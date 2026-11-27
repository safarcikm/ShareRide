import { Button } from "@/components/button";
import { NoIndex } from "@/components/no-index";
import { PuffinByPin } from "@/components/puffin-scenes";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { useLanguage } from "@/i18n/language";
import { sizes } from "@shareride/ui";

/**
 * An address the app does not have (spec 31, 3.21): an old link, or one
 * with a mistake in it. It says so with the title at the left, and the way
 * on is the main button in the bar, to Find. Under them stands the puffin
 * of a screen with nothing on it. Without this page the router shows its
 * own: black, in English, with a link to a list of every address (which
 * `app.json` turns off). Open to everyone, signed in or out, and not for
 * search engines.
 */
export default function NotFoundScreen() {
  const { t } = useLanguage();
  return (
    <Screen
      siteFooter
      // Find takes this page's place: back from Find does not show it again.
      footer={<Button main label={t("welcome.findRide")} href="/" replaces />}
    >
      <NoIndex />
      <ScreenHead title={t("notFound.title")} line={t("notFound.line")} />
      <PuffinByPin height={sizes.scenePuffin} />
    </Screen>
  );
}
