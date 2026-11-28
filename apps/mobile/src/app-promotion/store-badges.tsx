import type { Locale, MessageKey } from "@shareride/i18n";
import { storePage, type AppStore, type StoreLinkPlace } from "@shareride/domain";
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useConfig } from "@/beta/config";
import { useLanguage } from "@/i18n/language";
import { onWebsite } from "@/lib/on-website";
import { externalLinkProps } from "@/navigation/link-props";
import { sizes } from "@/theme/tokens";

/**
 * The stores whose PuffinRide page is public (ADR 0055), as `/v1/config`
 * last said; none in the phone apps, which show none of this (R35.2).
 */
export function useAppStores(): readonly AppStore[] {
  // An answer that does not say, as from an older API, names none.
  const { appStores = [] } = useConfig() as Partial<ReturnType<typeof useConfig>>;
  return onWebsite() ? appStores : [];
}

/**
 * Each store's badge as the store gives it (spec 35, 3.8; R35.5), served by
 * the website from `public/stores/` (made by `scripts/app-promotion-images.ts`).
 * Its width keeps the artwork's own proportions at the badge's height.
 * Google Play's is in the page's language; Apple's in English, as the App
 * Store page is.
 */
const badges = {
  app_store: {
    file: () => "/stores/app-store-badge-en.svg",
    // Apple's file is 119.66 by 40.
    width: Math.round((sizes.storeBadge * 119.66407) / 40),
    label: "appPromotion.badge.appStore",
  },
  google_play: {
    file: (locale: Locale) => `/stores/google-play-badge-${locale}.png`,
    // Google's badge, without its empty margin, is 564 by 168.
    width: Math.round((sizes.storeBadge * 564) / 168),
    label: "appPromotion.badge.googlePlay",
  },
} as const satisfies Record<
  AppStore,
  { file: (locale: Locale) => string; width: number; label: MessageKey }
>;

/**
 * The badges of the stores whose page is public, the App Store first, each a
 * link to its page that opens outside the website, as Facebook's does
 * (spec 35, 3.5 and 3.6). A quarter of their height apart, Apple's clear
 * space. Nothing while neither is public, or in the phone apps.
 */
export function StoreBadges({
  place,
  centred = false,
  style,
}: {
  readonly place: StoreLinkPlace;
  readonly centred?: boolean;
  /** Room around the badges, which takes none while there are none. */
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { t, locale } = useLanguage();
  const stores = useAppStores();
  if (stores.length === 0) return null;
  return (
    <View style={[styles.row, centred && styles.centred, style]}>
      {stores.map((store) => {
        const badge = badges[store];
        return (
          <Pressable
            key={store}
            accessibilityRole="link"
            accessibilityLabel={t(badge.label)}
            {...externalLinkProps(storePage(store, place))}
          >
            <Image
              testID="store-badge-image"
              source={{ uri: badge.file(locale) }}
              accessibilityIgnoresInvertColors
              style={{ width: badge.width, height: sizes.storeBadge }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: sizes.storeBadge / 4,
  },
  centred: { justifyContent: "center" },
});
