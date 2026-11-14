import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { chunky } from "@/theme/pressable";
import { edges, radii, spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

interface CardProps {
  readonly children: ReactNode;
  /** Makes the whole card a button, for example to open a meeting point. */
  readonly onPress?: () => void;
  /** The button's name: what the card shows, in one line. */
  readonly accessibilityLabel?: string;
}

/**
 * A surface with rounded corners and a chunky bottom edge (spec 15, section
 * 5.2). A card that can be pressed sinks over its edge, like a button.
 */
export function Card({ children, onPress, accessibilityLabel }: CardProps) {
  const palette = usePalette();
  const face = (pressed: boolean) => (
    <View
      testID="card-face"
      style={[
        styles.face,
        { backgroundColor: palette.surface },
        chunky(edges.card, palette.edge, pressed).face,
      ]}
    >
      {children}
    </View>
  );
  if (onPress === undefined) {
    return (
      <View testID="card" style={[styles.outer, chunky(edges.card, palette.edge, false).outer]}>
        {face(false)}
      </View>
    );
  }
  return (
    <Pressable
      testID="card"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.outer, chunky(edges.card, palette.edge, pressed).outer]}
    >
      {({ pressed }) => face(pressed)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: { borderRadius: radii.card },
  face: { borderRadius: radii.card, padding: spacing.md, gap: spacing.ms },
});
