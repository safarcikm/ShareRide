import { isOlderThan } from "@shareride/domain";
import { Linking } from "react-native";
import { thisDevice } from "@/auth/api";
import { useConfig } from "@/beta/config";
import { Button } from "@/components/button";
import { PuffinByPin } from "@/components/puffin-scenes";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { useLanguage } from "@/i18n/language";
import { sizes } from "@/theme/tokens";

/**
 * PuffinRide's page in each store: the store's own app first, then its web
 * page where that does not open (a phone without the store app, or the
 * iPhone simulator). The App Store's ID is the app's Apple ID in App Store
 * Connect, as `eas.json` has it (`ascAppId`); Google Play's is the package.
 */
export const storePages = {
  ios: {
    app: "itms-apps://apps.apple.com/app/id6840158626",
    web: "https://apps.apple.com/app/id6840158626",
  },
  android: {
    app: "market://details?id=is.puffinride.app",
    web: "https://play.google.com/store/apps/details?id=is.puffinride.app",
  },
} as const;

/**
 * Whether this app is older than the oldest version the API still serves
 * (spec 32, R32.4), as `/v1/config` last said. Only the phone apps: the
 * website is always the newest. Until the API answers, and from an API
 * that names no oldest version, every version goes on.
 */
export function useNeedsUpdate(): boolean {
  const { oldestAppVersion } = useConfig();
  const { platform, appVersion } = thisDevice();
  if (platform === "web" || appVersion === undefined) return false;
  return isOlderThan(appVersion, oldestAppVersion);
}

/**
 * "Update PuffinRide" (spec 32, 3.6 and section 5): the title and its one
 * line, the puffin of a screen with nothing on it under them, as on the
 * page the app does not have, and one main button to the store. It takes
 * the place of every screen, with no menu and no Back: no way past it.
 */
export function UpdateScreen() {
  const { t } = useLanguage();
  const platform = thisDevice().platform === "android" ? "android" : "ios";
  const page = storePages[platform];
  return (
    <Screen
      footer={
        <Button
          main
          label={t(platform === "android" ? "appUpdate.openGooglePlay" : "appUpdate.openAppStore")}
          onPress={() => {
            Linking.openURL(page.app).catch(() => Linking.openURL(page.web).catch(() => undefined));
          }}
        />
      }
    >
      <ScreenHead title={t("appUpdate.title")} line={t("appUpdate.line")} back={null} />
      <PuffinByPin height={sizes.scenePuffin} />
    </Screen>
  );
}
