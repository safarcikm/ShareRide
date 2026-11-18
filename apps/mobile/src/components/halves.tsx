import { Children, isValidElement, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { halfMinWidth, spacing } from "@/theme/tokens";

/**
 * Two parts of a card side by side, as wide as each other (spec 18, 3.2),
 * such as Get in and Get out on trip details. Where the card has no room
 * for two parts `halfMinWidth` wide, as in the main column of a window 900
 * wide or on a phone, the second goes under the first. A part that shows
 * nothing takes no room.
 */
export function Halves({
  children,
  testID,
}: {
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  return (
    <View testID={testID} style={styles.halves}>
      {Children.toArray(children).map((child, index) => (
        <View
          key={isValidElement(child) && child.key !== null ? child.key : index}
          testID="half"
          style={styles.half}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  halves: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.lg, rowGap: spacing.ms },
  // `minWidth`: a long name wraps inside its half, and does not widen it.
  half: { flexGrow: 1, flexShrink: 1, flexBasis: halfMinWidth, minWidth: 0, gap: spacing.ms },
});
