import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";

/**
 * Where Google's or Apple's window comes back to (spec 19, 3.2). On the web
 * it is the pop-up: its answer goes to the window underneath before the app
 * loads (popup-hand-off.web.ts), which closes the pop-up; this shows only if
 * the pop-up stays open, such as when that window was reloaded, and says
 * nothing of how the sign-in went. On a phone the browser sheet gives the
 * answer to the screen that opened it; if the phone also opens this
 * address, it closes.
 */
export default function ProviderReturnScreen() {
  const { t } = useLanguage();
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (router.canGoBack()) router.back();
    else router.replace("/sign-in");
  }, []);
  return (
    <Screen>
      {Platform.OS === "web" ? (
        <>
          <Title>{t("auth.provider.closeTitle")}</Title>
          <Body>{t("auth.provider.closeWindow")}</Body>
        </>
      ) : (
        <Title>{t("auth.provider.returning")}</Title>
      )}
    </Screen>
  );
}
