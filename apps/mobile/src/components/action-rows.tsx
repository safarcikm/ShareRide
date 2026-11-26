import { Children, createContext, useContext, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { controlOutline } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Card } from "./card";

const InActionRows = createContext(false);

/** Whether a `Row` stands in a card of rows, where it reaches the card's edges. */
export function useInActionRows(): boolean {
  return useContext(InActionRows);
}

/**
 * A card of `Row`s with a line between them (spec 31, 3.3): what else a
 * screen can do, under its one main button, in place of a column of
 * secondary buttons and loose text links. A row that cannot be undone is
 * red and comes last (R31.3). A row that is left out leaves no line.
 */
export function ActionRows({ children }: { readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <Card flush>
      <InActionRows value>
        {Children.toArray(children).map((row, index) => (
          <View
            key={index}
            testID="action-row"
            style={index === 0 ? null : [styles.line, { borderTopColor: palette.border }]}
          >
            {row}
          </View>
        ))}
      </InActionRows>
    </Card>
  );
}

const styles = StyleSheet.create({ line: { borderTopWidth: controlOutline } });
