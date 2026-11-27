import { createContext, useContext, type ReactNode } from "react";
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
 * red and comes last (R31.3).
 *
 * The lines are the card of rows showing between its rows, each of which
 * is a surface of its own. So a row that is left out, or a part that shows
 * nothing, leaves no line, and rows given together in a fragment have
 * theirs.
 */
export function ActionRows({ children }: { readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <Card flush>
      <InActionRows value>
        <View testID="action-rows" style={[styles.rows, { backgroundColor: palette.border }]}>
          {children}
        </View>
      </InActionRows>
    </Card>
  );
}

const styles = StyleSheet.create({ rows: { gap: controlOutline } });
