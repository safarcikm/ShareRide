import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useHover } from "@/theme/hover";
import { cardLift } from "@/theme/pressable";
import { radii, sizes, spacing } from "@/theme/tokens";
import { usePalette, useScheme } from "@/theme/use-palette";
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
  /**
   * A button of its own in the top right corner, such as Share (spec 28,
   * 3.1): drawn over the card but outside its pressable part, after it, so a
   * screen reader and the keyboard reach it and pressing it does not press
   * the card. What the card holds leaves it `cardCornerRoom` at the end of
   * its first line.
   */
  readonly corner?: ReactNode;
  /**
   * No padding or gap of its own: what it holds reaches its edges and is
   * cut by its corners, as a ride ticket's tear line and a card of rows are
   * (spec 31, 3.3).
   */
  readonly flush?: boolean;
  /**
   * A ride that is mine (spec 31, 3.3): a `primary` outline, which turns
   * `primaryEdge` where another card's outline turns `primary`.
   */
  readonly mine?: boolean;
}

/**
 * The room a card's first line leaves at its end for a `corner`: a quiet
 * icon button, drawn 36 round 8 from the card's edge, whose 44 tap area
 * reaches 48 in, past the face's 16 padding.
 */
export const cardCornerRoom = sizes.iconButton + spacing.xs - spacing.md;

/** What a card's corner tells the card: the pointer or the keyboard came to it. */
export interface CardCornerEvents {
  readonly onHoverIn: () => void;
  readonly onHoverOut: () => void;
  readonly onFocus: () => void;
}

const CardCorner = createContext<CardCornerEvents | null>(null);

/**
 * For the button in a card's `corner`: the pointer over it, or the keyboard
 * on it, counts as on the card, so the card keeps its edge and a map beside
 * it shows its trip. Null outside a card's corner.
 */
export function useCardCorner(): CardCornerEvents | null {
  return useContext(CardCorner);
}

/**
 * A surface with rounded corners, a hairline round it and a soft shadow
 * under it (spec 15, sections 4.4 and 5.2). A card that can be pressed sinks
 * a little when pressed. Under the pointer its outline turns `primary`; the
 * face stays `surface`, so a tag or an avatar on a tint of its own keeps its
 * shape (spec 18, 3.4). A `marked` card keeps that outline.
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
  corner,
  flush = false,
  mine = false,
}: CardProps) {
  const [cornerHovered, cornerHover] = useHover();
  const events = useMemo<CardCornerEvents>(
    () => ({
      onHoverIn: () => {
        cornerHover.onHoverIn();
        onHoverIn?.();
      },
      onHoverOut: cornerHover.onHoverOut,
      onFocus: () => {
        onFocus?.();
      },
    }),
    [cornerHover, onHoverIn, onFocus],
  );
  const card = (
    <PlainCard
      onPress={onPress}
      href={href}
      accessibilityLabel={accessibilityLabel}
      onHoverIn={onHoverIn}
      onFocus={onFocus}
      marked={marked || cornerHovered}
      fill={fill}
      flush={flush}
      mine={mine}
    >
      {children}
    </PlainCard>
  );
  if (corner === undefined) return card;
  return (
    <View testID="card-with-corner" style={fill && styles.fill}>
      {card}
      <View testID="card-corner" style={styles.corner}>
        <CardCorner.Provider value={events}>{corner}</CardCorner.Provider>
      </View>
    </View>
  );
}

function PlainCard({
  children,
  onPress,
  href,
  accessibilityLabel,
  onHoverIn,
  onFocus,
  marked = false,
  fill = false,
  flush = false,
  mine = false,
}: Omit<CardProps, "corner">) {
  const palette = usePalette();
  const scheme = useScheme();
  const [hovered, hover] = useHover();
  const resting = mine ? palette.primary : undefined;
  const shown = mine ? palette.primaryEdge : palette.primary;
  const ring = hovered || marked ? shown : resting;
  const face = (pressed: boolean) => (
    <View
      testID="card-face"
      style={[
        styles.face,
        flush && styles.flush,
        fill && styles.fill,
        { backgroundColor: palette.surface },
        cardLift(scheme, { pressed, ring }).face,
      ]}
    >
      {children}
    </View>
  );
  if (onPress === undefined && href === undefined) {
    return (
      <View
        testID="card"
        style={[styles.outer, fill && styles.fill, cardLift(scheme, { ring }).outer]}
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
        cardLift(scheme, { pressed, ring }).outer,
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
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  // The tap area's corner: the button it holds is drawn 4 further in.
  corner: { position: "absolute", top: spacing.xs, right: spacing.xs },
});
