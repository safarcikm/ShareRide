import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useHover } from "@/theme/hover";
import { chunky } from "@/theme/pressable";
import { edges, radii, spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { linkProps, type AppPath } from "@/navigation/link-props";

interface CardProps {
  readonly children: ReactNode;
  /** Makes the whole card a button, for example to open a meeting point. */
  readonly onPress?: () => void;
  /**
   * Makes the whole card a link to this screen instead: an `<a href>` on the
   * web, which search engines follow (spec 23, 3.6).
   */
  readonly href?: AppPath;
  /** The button's name: what the card shows, in one line. */
  readonly accessibilityLabel?: string;
  /**
   * For a card that can be pressed: the pointer or the keyboard came to it,
   * for a screen that shows more about it elsewhere, such as on a map.
   */
  readonly onHoverIn?: (() => void) | undefined;
  readonly onFocus?: (() => void) | undefined;
  /**
   * For a card that can be pressed: it is the one shown elsewhere, such as
   * on a map, and keeps the edge it has under the pointer.
   */
  readonly marked?: boolean;
  /**
   * Takes the height it is given, as in a `Grid`, where the cards of a row
   * are as tall as the tallest; what it holds decides where the room goes.
   */
  readonly fill?: boolean;
}

/**
 * A surface with rounded corners and a chunky bottom edge (spec 15, section
 * 5.2). A card that can be pressed sinks over its edge, like a button.
 * Under the pointer its edge turns `primary`; the face stays `surface`, so
 * a tag or an avatar on a tint of its own keeps its shape (spec 18, 3.4).
 * A `marked` card keeps that edge.
 */
export function Card({
  children,
  onPress,
  href,
  accessibilityLabel,
  onHoverIn,
  onFocus,
  marked = false,
  fill = false,
}: CardProps) {
  const palette = usePalette();
  const [hovered, hover] = useHover();
  const edgeColor = hovered || marked ? palette.primary : palette.edge;
  const face = (pressed: boolean) => (
    <View
      testID="card-face"
      style={[
        styles.face,
        fill && styles.fill,
        { backgroundColor: palette.surface },
        chunky(edges.card, edgeColor, pressed).face,
      ]}
    >
      {children}
    </View>
  );
  if (onPress === undefined && href === undefined) {
    return (
      <View
        testID="card"
        style={[styles.outer, fill && styles.fill, chunky(edges.card, palette.edge, false).outer]}
      >
        {face(false)}
      </View>
    );
  }
  return (
    <Pressable
      testID="card"
      accessibilityRole={href === undefined ? "button" : "link"}
      accessibilityLabel={accessibilityLabel}
      {...(href === undefined ? { onPress } : linkProps(href))}
      onHoverIn={() => {
        hover.onHoverIn();
        onHoverIn?.();
      }}
      onHoverOut={hover.onHoverOut}
      onFocus={onFocus}
      style={({ pressed }) => [
        styles.outer,
        fill && styles.fill,
        chunky(edges.card, edgeColor, pressed).outer,
      ]}
    >
      {({ pressed }) => face(pressed)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: { borderRadius: radii.card },
  fill: { flexGrow: 1 },
  face: { borderRadius: radii.card, padding: spacing.md, gap: spacing.ms },
});
