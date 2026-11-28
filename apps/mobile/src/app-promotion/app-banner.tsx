import { storeOfUserAgent, storePage } from "@shareride/domain";
import { useSegments } from "expo-router";
import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useAnalytics } from "@/analytics/analytics";
import { consentAsksOn, signingIn } from "@/analytics/consent-bar";
import { screenPattern } from "@/analytics/screen-pattern";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { Logo } from "@/components/logo";
import { useLanguage } from "@/i18n/language";
import { readPreference, writePreference } from "@/lib/preferences";
import { controlOutline, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { browserUserAgent } from "./browser";
import { useAppStores } from "./store-badges";

/** Where the browser keeps when the strip was closed or used (spec 35, section 7). */
export const appBannerClosedKey = "app-banner-closed";

/**
 * Whether this browser closed the strip before: undefined while that is
 * read, so it never shows for a moment and then goes.
 */
function useClosedBefore(): readonly [boolean | undefined, () => void] {
  const [closed, setClosed] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let current = true;
    void readPreference(appBannerClosedKey).then((value) => {
      if (current) setClosed(value !== null);
    });
    return () => {
      current = false;
    };
  }, []);
  const close = () => {
    setClosed(true);
    // Only when; nothing else (spec 35, section 7).
    void writePreference(appBannerClosedKey, JSON.stringify({ at: new Date().toISOString() }));
  };
  return [closed, close];
}

/**
 * The strip about the app on an Android phone's browser (spec 35, 3.4),
 * across the top of the window above everything, pushing the page down
 * (R35.3): the logo, the name and one line, Install, which opens Google
 * Play, and ×. Once either is pressed it stays away in this browser
 * (R35.4). Only while Google Play's page is public; not on a wide screen,
 * not while signing in, and not while the question about cookies is open,
 * so the visitor sees one thing at a time. iPhones have Apple's own banner;
 * the phone apps have neither.
 */
export function AppBanner({ wide }: { readonly wide: boolean }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const stores = useAppStores();
  const { available, choice } = useAnalytics();
  const pattern = screenPattern(useSegments());
  const [closed, close] = useClosedBefore();
  // The question is open, or its answer is still being read, on a screen
  // that asks it.
  const asking = available && (choice === null || choice === undefined) && consentAsksOn(pattern);
  const android = storeOfUserAgent(browserUserAgent()) === "google_play";
  if (
    !android ||
    !stores.includes("google_play") ||
    wide ||
    closed !== false ||
    asking ||
    signingIn(pattern)
  ) {
    return null;
  }
  return (
    <View
      role="region"
      aria-label={t("appPromotion.banner.label")}
      style={[
        styles.strip,
        { backgroundColor: palette.surface, borderBottomColor: palette.border },
      ]}
    >
      <Logo size={sizes.logoSmall} />
      <View style={styles.words}>
        <Text style={[typography.label, { color: palette.text }]}>{t("app.name")}</Text>
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {t("appPromotion.banner.line")}
        </Text>
      </View>
      <Button
        variant="secondary"
        label={t("appPromotion.banner.install")}
        onPress={() => {
          close();
          Linking.openURL(storePage("google_play", "banner")).catch(() => undefined);
        }}
      />
      <IconButton quiet icon={X} label={t("appPromotion.banner.close")} onPress={close} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderBottomWidth: controlOutline,
  },
  words: { flex: 1, minWidth: 0 },
});
