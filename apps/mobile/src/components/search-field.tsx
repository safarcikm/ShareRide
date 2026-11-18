import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { radii, sizes, spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * The value of From, To or the date in the search row of a wide page (spec
 * 18, 3.5): a box as high as a button in the page's colour, a shade off the
 * card it is on, so it is plain where to press before the pointer is
 * there. `hovered`, with the pointer over its part, it is tinted as a row
 * is. The part around it is what is pressed; this is only its look.
 */
export function SearchField({
  hovered,
  children,
}: {
  readonly hovered: boolean;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  return (
    <View
      testID="search-field"
      style={[
        styles.field,
        { backgroundColor: hovered ? palette.primarySoft : palette.background },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // The text starts where the text of the place search does, which takes
  // the field's place; a value on two lines keeps room above and under it.
  field: {
    minHeight: sizes.buttonHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
});
