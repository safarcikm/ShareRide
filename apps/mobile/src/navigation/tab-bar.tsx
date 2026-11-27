import type { TabTriggerSlotProps } from "expo-router/ui";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { useLanguage } from "@/i18n/language";
import { controlOutline, iconSizes, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { CountBadge } from "./count-badge";
import type { MenuTab } from "./menu";

const onWeb = Platform.OS === "web";

/**
 * On the web a tab is never narrower than the longest word of its name,
 * and the tabs go on a second row when they do not all fit, as with text
 * twice as large on a narrow phone (WCAG 1.4.4). A phone breaks such a
 * word itself, inside its tab.
 */
const wholeWords: object = onWeb ? { minWidth: "min-content" } : {};

/** How high the bar is, over the phone's bottom inset: its line, its padding and a tab. */
export const tabBarHeight = (bottomInset: number): number =>
  controlOutline + spacing.xs + sizes.tab + Math.max(bottomInset, spacing.xs);

/** The bar's height as it was last laid out, and who wants to hear of another. */
let laidOut: number | null = null;
const listeners = new Set<() => void>();
const listen = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const keep = (height: number | null) => {
  laidOut = height;
  for (const listener of listeners) listener();
};

/**
 * How high the bar is: as it was laid out, which is higher than counted
 * where large text gives its names more lines or the bar a second row;
 * until then, as counted.
 */
export function useTabBarHeight(bottomInset: number): number {
  const measured = useSyncExternalStore(
    listen,
    () => laidOut,
    () => null,
  );
  return measured ?? tabBarHeight(bottomInset);
}

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
  // A bar that is gone has no height: the next one is counted until laid out.
  useEffect(
    () => () => {
      keep(null);
    },
    [],
  );
  if (hidden) return null;
  const role = onWeb
    ? ({ role: "navigation", "aria-label": t("nav.main") } as const)
    : ({ accessibilityRole: "tablist", accessibilityLabel: t("nav.main") } as const);
  return (
    <View
      {...rest}
      {...role}
      testID="tab-bar"
      onLayout={(event) => {
        rest.onLayout?.(event);
        // The web tells a height of nothing for a bar out of sight, as
        // under another screen: the height it had stays.
        const { height } = event.nativeEvent.layout;
        if (height > 0) keep(height);
      }}
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
 * and what a press does. The icons stand in a line, whatever lines the
 * names take.
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
    <Pressable
      {...pressable}
      {...role}
      accessibilityLabel={spoken}
      // For the phone journeys (apps/mobile/maestro), whatever the language.
      testID={`tab-${tab.name}`}
      style={[styles.tab, wholeWords]}
    >
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

/** How high a tab's icon in its pill and a name of one line are together. */
const oneLineTab = iconSizes.button + spacing.xs * 2 + spacing.xs + typography.caption.lineHeight;

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: controlOutline,
    paddingTop: spacing.xs,
  },
  // From the top, so the icons stand in a line when a name takes two lines
  // ("Ferðirnar mínar") and the others one; as far from it as puts an icon
  // over a name of one line at the tab's middle.
  tab: {
    flex: 1,
    minHeight: sizes.tab,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: spacing.xs,
    paddingTop: (sizes.tab - oneLineTab) / 2,
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
