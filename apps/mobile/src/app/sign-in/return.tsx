import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";

/**
 * Where Google's or Apple's window comes back to (spec 19, 3.2). On the web
 * it is the pop-up: the app hands the answer to the window underneath as it
 * loads (complete-popup.web.ts), which closes the pop-up; this shows only if
 * that window is gone. On a phone the browser sheet gives the answer to the
 * screen that opened it; if the phone also opens this address, it closes.
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
      <Title>{t("auth.provider.returning")}</Title>
      {Platform.OS === "web" ? <Body>{t("auth.provider.closeWindow")}</Body> : null}
    </Screen>
  );
}
