import { router, usePathname } from "expo-router";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LanguageSwitch } from "@/components/language-switch";
import { Logo } from "@/components/logo";
import { useLanguage } from "@/i18n/language";
import { controlOutline, minTouchTarget, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { menuTabOf, menuTabs, type MenuTab } from "./menu";

const onWeb = Platform.OS === "web";

/**
 * Goes to a place of the menu, closing the screens opened on top, so the
 * bar never piles up screens behind Back.
 */
function openPlace(href: MenuTab["href"]) {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(href);
}

/**
 * The menu on wide screens (spec 16, 3.1): the logo and name, the four
 * places and the language, in a bar at the top of every screen. The place
 * the screen belongs to is chosen: `primary` and underlined.
 */
export function TopBar({
  onSwitchLanguage,
}: {
  readonly onSwitchLanguage?: (locale: "is" | "en") => void;
}) {
  const palette = usePalette();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const current = menuTabOf(usePathname());
  const role = onWeb
    ? ({ role: "navigation", "aria-label": t("nav.main") } as const)
    : ({ accessibilityRole: "tablist" } as const);
  return (
    <View
      testID="top-bar"
      style={[
        styles.bar,
        {
          backgroundColor: palette.surface,
          borderBottomColor: palette.border,
          paddingTop: insets.top + spacing.sm,
          paddingLeft: insets.left + spacing.lg,
          paddingRight: insets.right + spacing.lg,
        },
      ]}
    >
      <View style={styles.brand}>
        <Logo size={sizes.logoSmall} />
        <Text style={[typography.heading, { color: palette.text }]}>{t("app.name")}</Text>
      </View>
      <View {...role} style={styles.places}>
        {menuTabs.map((tab) => {
          const chosen = tab.name === current;
          const label = t(tab.label);
          const a11y = onWeb
            ? ({
                role: "link",
                href: tab.href,
                "aria-current": chosen ? "page" : undefined,
              } as const)
            : ({ accessibilityRole: "tab", accessibilityState: { selected: chosen } } as const);
          return (
            <Pressable
              key={tab.name}
              {...a11y}
              accessibilityLabel={label}
              onPress={(event) => {
                // A link on the web: the app moves, the page does not reload.
                event.preventDefault();
                openPlace(tab.href);
              }}
              style={styles.place}
            >
              <Text
                style={[
                  typography.label,
                  { color: chosen ? palette.primary : palette.text },
                  chosen && styles.chosen,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <LanguageSwitch onSwitch={onSwitchLanguage} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: controlOutline,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  places: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  place: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.ms,
  },
  chosen: { textDecorationLine: "underline" },
});
