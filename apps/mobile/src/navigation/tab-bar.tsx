import type { TabTriggerSlotProps } from "expo-router/ui";
import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { useLanguage } from "@/i18n/language";
import { controlOutline, iconSizes, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { CountBadge } from "./count-badge";
import type { MenuTab } from "./menu";

const onWeb = Platform.OS === "web";

/** How high the bar is, over the phone's bottom inset: its line, its padding and a tab. */
export const tabBarHeight = (bottomInset: number): number =>
  controlOutline + spacing.xs + sizes.tab + Math.max(bottomInset, spacing.xs);

/**
 * The menu as a bar at the bottom of a phone's five main screens (spec 16,
 * 3.1): `surface`, a 2 `border` line on top, and room for the phone's home
 * indicator. Phones read it as a tab list; the web as the main navigation.
 * `TabList` passes the tabs in as `children`. Hidden on wide screens, where
 * the top bar shows the menu.
 */
export function TabBar({
  hidden = false,
  children,
  style,
  ...rest
}: ViewProps & { readonly hidden?: boolean; readonly children?: ReactNode }) {
  const palette = usePalette();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  if (hidden) return null;
  const role = onWeb
    ? ({ role: "navigation", "aria-label": t("nav.main") } as const)
    : ({ accessibilityRole: "tablist", accessibilityLabel: t("nav.main") } as const);
  return (
    <View
      {...rest}
      {...role}
      testID="tab-bar"
      style={[
        style,
        styles.bar,
        {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
          // tabBarHeight counts the same.
          paddingBottom: Math.max(insets.bottom, spacing.xs),
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      {children}
    </View>
  );
}

/**
 * One place of the menu: its icon over its name. The chosen one is in
 * `primary`, with a `primarySoft` pill behind the icon; the others are in
 * `textMuted`. A count, such as unread messages, sits on the icon's corner
 * and is said with the name. `TabTrigger` passes in whether it is chosen
 * and what a press does.
 */
export function TabButton({
  tab,
  count = 0,
  isFocused = false,
  href,
  // The bar lays the tabs out itself.
  style: _style,
  ref: _ref,
  ...pressable
}: TabTriggerSlotProps & { readonly tab: MenuTab; readonly count?: number }) {
  const palette = usePalette();
  const { t } = useLanguage();
  const label = t(tab.label);
  const spoken = count > 0 ? `${label}, ${t("chat.unread", { count })}` : label;
  const colour = isFocused ? palette.primary : palette.textMuted;
  const role = onWeb
    ? ({ role: "link", href, "aria-current": isFocused ? "page" : undefined } as const)
    : ({ accessibilityRole: "tab", accessibilityState: { selected: isFocused } } as const);
  return (
    <Pressable {...pressable} {...role} accessibilityLabel={spoken} style={styles.tab}>
      <View style={[styles.pill, { backgroundColor: isFocused ? palette.primarySoft : undefined }]}>
        <Icon icon={tab.icon} color={colour} size={iconSizes.button} />
        <View style={styles.corner}>
          <CountBadge count={count} />
        </View>
      </View>
      <Text style={[typography.caption, styles.label, { color: colour }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: controlOutline,
    paddingTop: spacing.xs,
  },
  tab: {
    flex: 1,
    minHeight: sizes.tab,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  pill: {
    width: sizes.tabPill,
    paddingVertical: spacing.xs,
    alignItems: "center",
    borderRadius: radii.pill,
  },
  label: { textAlign: "center" },
  corner: { position: "absolute", top: 0, right: spacing.xs },
});
