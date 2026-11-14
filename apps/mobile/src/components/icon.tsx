import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { iconSizes, iconStroke } from "@/theme/tokens";

interface IconProps {
  /** A Lucide icon, such as `Check` or `CircleAlert`. */
  readonly icon: LucideIcon;
  readonly color: string;
  readonly size?: number;
  readonly testID?: string;
}

/**
 * A Lucide icon at the spec's stroke (spec 15, section 4.5), hidden from
 * screen readers: it sits next to text that says the same thing. An icon on
 * its own needs an accessible name on the part around it.
 */
export function Icon({ icon: Glyph, color, size = iconSizes.button, testID }: IconProps) {
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <Glyph size={size} color={color} strokeWidth={iconStroke} />
    </View>
  );
}
