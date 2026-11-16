import { usePathname } from "expo-router";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LanguageSwitch } from "@/components/language-switch";
import { Logo } from "@/components/logo";
import { useUnread } from "@/chat/unread";
import { useLanguage } from "@/i18n/language";
import { controlOutline, minTouchTarget, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { CountBadge } from "./count-badge";
import { menuTabOf, menuTabs } from "./menu";
import { openPlace } from "./open-place";

const onWeb = Platform.OS === "web";

/**
 * On the web, a click with a modifier key is the browser's: it opens the
 * link in a new tab or window, and the app stays where it is.
 */
function opensElsewhere(event: GestureResponderEvent): boolean {
  if (!onWeb) return false;
  const click = event as unknown as Partial<MouseEvent>;
  return (
    click.metaKey === true ||
    click.ctrlKey === true ||
    click.shiftKey === true ||
    click.altKey === true ||
    (click.button !== undefined && click.button !== 0)
  );
}

/**
 * The menu on wide screens (spec 16, 3.1): the logo and name, the places
 * and the language, in a bar at the top of every screen. The place the
 * screen belongs to is chosen: `primary` and underlined. Messages shows its
 * unread count after its name.
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
  const { total } = useUnread();
  const role = onWeb
    ? ({ role: "navigation", "aria-label": t("nav.main") } as const)
    : ({ accessibilityRole: "tablist", accessibilityLabel: t("nav.main") } as const);
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
          const count = tab.name === "messages" ? total : 0;
          const spoken = count > 0 ? `${label}, ${t("chat.unread", { count })}` : label;
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
              accessibilityLabel={spoken}
              onPress={(event) => {
                if (opensElsewhere(event)) return;
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
              <CountBadge count={count} />
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
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.ms,
  },
  chosen: { textDecorationLine: "underline" },
});
