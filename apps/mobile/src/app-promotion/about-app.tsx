import type { MessageKey } from "@shareride/i18n";
import { Image, StyleSheet, Text, View } from "react-native";
import { useWideScreen } from "@/components/screen";
import { Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { controlOutline, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { StoreBadges, useAppStores } from "./store-badges";

/** What each store asks to be said where its badge is (spec 35, 3.6). */
const trademarks = {
  app_store: "appPromotion.trademark.appStore",
  google_play: "appPromotion.trademark.googlePlay",
} as const satisfies Record<string, MessageKey>;

/**
 * About's section on the app (spec 35, 3.6): its heading, one line, the
 * badges, and on a laptop a QR code of `https://puffinride.is/app`, which
 * sends each phone to its store; a phone is the camera, so it has none.
 * Then, small, the trademark lines of the stores shown. Only on the
 * website, while a store's page is public.
 */
export function AboutApp() {
  const { t } = useLanguage();
  const palette = usePalette();
  const wide = useWideScreen();
  const stores = useAppStores();
  if (stores.length === 0) return null;
  return (
    <View testID="about-app" style={styles.section}>
      <Heading>{t("appPromotion.about.title")}</Heading>
      <Text style={[typography.body, { color: palette.text }]}>{t("appPromotion.about.line")}</Text>
      <View style={wide ? styles.beside : styles.under}>
        <StoreBadges place="about" />
        {wide ? (
          <View style={styles.code}>
            <Image
              source={{ uri: "/stores/app-qr.svg" }}
              accessibilityLabel={t("appPromotion.about.qr")}
              accessibilityIgnoresInvertColors
              style={[styles.qr, { borderColor: palette.border }]}
            />
            <Text style={[typography.small, styles.scan, { color: palette.textMuted }]}>
              {t("appPromotion.about.scan")}
            </Text>
          </View>
        ) : null}
      </View>
      <View>
        {stores.map((store) => (
          <Text key={store} style={[typography.caption, { color: palette.textMuted }]}>
            {t(trademarks[store])}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  under: { gap: spacing.md },
  // On a laptop the code stands after the badges, with its line beside it.
  beside: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  code: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexShrink: 1 },
  // The code's own white margin is its quiet zone; the edge sets it off
  // from a light page.
  qr: {
    width: sizes.qrCode,
    height: sizes.qrCode,
    borderWidth: controlOutline,
    borderRadius: radii.tag,
  },
  scan: { flexShrink: 1, maxWidth: sizes.qrCode * 2 },
});
