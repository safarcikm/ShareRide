import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useHover } from "@/theme/hover";
import { chunky } from "@/theme/pressable";
import { edges, radii, spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

interface CardProps {
  readonly children: ReactNode;
  /** Makes the whole card a button, for example to open a meeting point. */
  readonly onPress?: () => void;
  /** The button's name: what the card shows, in one line. */
  readonly accessibilityLabel?: string;
  /**
   * For a card that can be pressed: the pointer or the keyboard came to it,
   * for a screen that shows more about it elsewhere, such as on a map.
   */
  readonly onHoverIn?: () => void;
  readonly onFocus?: () => void;
}

/**
 * A surface with rounded corners and a chunky bottom edge (spec 15, section
 * 5.2). A card that can be pressed sinks over its edge, like a button.
 * Under the pointer its edge turns `primary`; the face stays `surface`, so
 * a tag or an avatar on a tint of its own keeps its shape (spec 18, 3.4).
 */
export function Card({ children, onPress, accessibilityLabel, onHoverIn, onFocus }: CardProps) {
  const palette = usePalette();
  const [hovered, hover] = useHover();
  const edgeColor = hovered ? palette.primary : palette.edge;
  const face = (pressed: boolean) => (
    <View
      testID="card-face"
      style={[
        styles.face,
        { backgroundColor: palette.surface },
        chunky(edges.card, edgeColor, pressed).face,
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
      onHoverIn={() => {
        hover.onHoverIn();
        onHoverIn?.();
      }}
      onHoverOut={hover.onHoverOut}
      onFocus={onFocus}
      style={({ pressed }) => [styles.outer, chunky(edges.card, edgeColor, pressed).outer]}
    >
      {({ pressed }) => face(pressed)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: { borderRadius: radii.card },
  face: { borderRadius: radii.card, padding: spacing.md, gap: spacing.ms },
});
