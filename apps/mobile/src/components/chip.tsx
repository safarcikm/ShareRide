import { Check, ChevronDown, ChevronUp, type LucideIcon } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, Text } from "react-native";
import { useHover } from "@/theme/hover";
import {
  controlOutline,
  iconSizes,
  minTouchTarget,
  radii,
  sizes,
  spacing,
  typography,
} from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Icon } from "./icon";
import { spaceKeyPresses } from "./space-key";

/** Extra touch area above and below, so a 40 high chip is 44 to tap (spec 15, section 4.4). */
const slop = (minTouchTarget - sizes.chipHeight) / 2;
const hitSlop = { top: slop, bottom: slop, left: 0, right: 0 } as const;
/**
 * The web has no touch area beyond what is drawn, so there a chip is
 * drawn as high as a touch target (spec 31, 3.20).
 */
const height = Platform.OS === "web" ? minTouchTarget : sizes.chipHeight;

/**
 * A choice that can be turned on and off, such as a spoken language
 * (`checkbox`, the default), one choice of several, such as a car's colour
 * (`radio`), or a suggestion that fills a field (`button`). A selected chip
 * shows a tick as well as its colour; under the pointer, a chip that is not
 * selected is tinted and keeps its outline (spec 18, 3.4). A `button` chip with `expanded` opens
 * choices under it, such as the order of search results, and shows a chevron.
 * With an `icon`, that stands before the label, where the tick would, in the
 * chip's colour. `name` is what screen readers call a chip whose label alone
 * does not say what it is, such as "Sort: Earliest" for "Earliest"; it holds
 * the label, so voice control finds the chip by what it shows.
 * `lang` is the language of a label that is not in the app's, such as
 * "Íslenska" in English, so screen readers read it in that language.
 */
export function Chip({
  label,
  selected,
  onToggle,
  role = "checkbox",
  expanded,
  icon,
  name,
  lang,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onToggle: () => void;
  readonly role?: "checkbox" | "radio" | "button";
  /** A Lucide icon before the label, such as `SlidersHorizontal` for filters. */
  readonly icon?: LucideIcon;
  /** The chip's name for screen readers, when the label alone is not enough. */
  readonly name?: string;
  /** Whether the choices it opens show; leave out for a chip that opens nothing. */
  readonly expanded?: boolean;
  /** A BCP 47 tag, such as "is". */
  readonly lang?: string;
}) {
  const palette = usePalette();
  const [hovered, hover] = useHover();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={name ?? label}
      // aria-checked rather than accessibilityState, which the web build drops.
      aria-checked={role === "button" ? undefined : selected}
      aria-expanded={expanded}
      accessibilityLanguage={lang}
      // react-native-web reads lang; React Native's types do not know it.
      {...(Platform.OS === "web" && lang !== undefined ? { lang } : {})}
      onPress={onToggle}
      {...(role === "button" ? {} : spaceKeyPresses(onToggle))}
      hitSlop={hitSlop}
      {...hover}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: palette.primarySoft, borderColor: palette.primary }
          : {
              backgroundColor: hovered ? palette.primarySoft : palette.surface,
              borderColor: palette.control,
            },
      ]}
    >
      {icon !== undefined ? (
        <Icon
          icon={icon}
          color={selected ? palette.primary : palette.text}
          size={iconSizes.tick}
          testID="chip-icon"
        />
      ) : selected ? (
        <Icon icon={Check} color={palette.primary} size={iconSizes.tick} testID="chip-tick" />
      ) : null}
      <Text
        style={[
          typography.label,
          styles.label,
          { color: selected ? palette.primary : palette.text },
        ]}
      >
        {label}
      </Text>
      {expanded === undefined ? null : (
        <Icon
          icon={expanded ? ChevronUp : ChevronDown}
          color={selected ? palette.primary : palette.text}
          size={iconSizes.tick}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: height,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: controlOutline,
    borderRadius: radii.pill,
    alignSelf: "flex-start",
  },
  label: { flexShrink: 1 },
});
