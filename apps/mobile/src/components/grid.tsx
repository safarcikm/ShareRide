import {
  Children,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";
import { StyleSheet, View } from "react-native";
import { gridCardMinWidth, spacing } from "@/theme/tokens";

/**
 * Cards in as many equal columns as fit (spec 18, 3.2): each column is at
 * least `minWidth` wide, so a phone and a narrow column get one and a wide
 * page two or three. The count follows the room the grid has, not the
 * window, and not the size of the text. Children that show nothing take
 * no cell.
 */
export function Grid({
  children,
  minWidth = gridCardMinWidth,
}: {
  readonly children: ReactNode;
  readonly minWidth?: number;
}) {
  const grid = useRef<ComponentRef<typeof View>>(null);
  const [width, setWidth] = useState<number | null>(null);
  // Where the platform can say the width before the first paint, as the
  // web can, the cards do not start in one column and then jump.
  useLayoutEffect(() => {
    const measured = widthOf(grid.current);
    if (measured !== null) setWidth(measured);
  }, []);

  const gap = spacing.md;
  const columns = width === null ? 1 : Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
  // Whole points, so a rounding error never sends the last column to the next row.
  const cell = width === null ? "100%" : Math.floor((width - gap * (columns - 1)) / columns);
  return (
    <View
      ref={grid}
      testID="grid"
      style={styles.grid}
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      {Children.toArray(children).map((child, index) => (
        // A card keeps its cell, and so what it holds, when the cards change order.
        <View
          key={isValidElement(child) && child.key !== null ? child.key : index}
          testID="grid-cell"
          style={{ width: cell }}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

/**
 * The width of a view that is laid out already, or null where it cannot be
 * asked (a platform without `getBoundingClientRect`) or is not known yet.
 */
export function widthOf(view: ComponentRef<typeof View> | null): number | null {
  const node = view as { getBoundingClientRect?: () => { readonly width: number } } | null;
  const width = node?.getBoundingClientRect?.().width;
  return width === undefined || width <= 0 ? null : width;
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
});
