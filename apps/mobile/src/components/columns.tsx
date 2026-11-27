import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { maxContentWidth, sideColumnWidth, spacing } from "@/theme/tokens";
import { stickyOnWeb, useScreenViewHeight, useWideScreen } from "./screen";

/**
 * A main column with a side column on wide screens (spec 18, 3.2), inside
 * a `Screen` with `width="page"`. The main column takes the room that is
 * left; the side column has a set width and, on the web, stays in view
 * while the main column scrolls. Phones stack the two, main first. The
 * columns come to a reader and the keyboard as the eye meets them: the
 * main one first, or the side one where it stands at the left
 * (`sideAt="start"`), as who I am does on Profile.
 *
 * The main column is the same part at any width and on either side, so
 * what its parts hold, such as an open payment, stays when a window
 * crosses the breakpoint. A screen whose phone layout mixes the two
 * columns' parts gives a `side` on wide screens only, and null on a
 * phone, where the stack is then the main column alone.
 */
export function Columns({
  children,
  side,
  sideAt = "end",
  sideWidth = sideColumnWidth,
}: {
  readonly children: ReactNode;
  readonly side: ReactNode;
  readonly sideAt?: "start" | "end";
  readonly sideWidth?: number;
}) {
  const wide = useWideScreen();
  const viewHeight = useScreenViewHeight();
  if (!wide) {
    return (
      <View testID="columns" style={styles.stack}>
        <View key="main" testID="columns-main" style={styles.part}>
          {children}
        </View>
        {side === null || side === undefined ? null : (
          <View key="side" testID="columns-side" style={styles.part}>
            {side}
          </View>
        )}
      </View>
    );
  }
  // Each has its key, so the main column is kept whichever comes first.
  const main = (
    <View key="main" testID="columns-main" style={styles.main}>
      {children}
    </View>
  );
  const beside = (
    <View
      key="side"
      testID="columns-side"
      style={[styles.part, { width: sideWidth }, stickyOnWeb(viewHeight)]}
    >
      {side}
    </View>
  );
  return (
    <View testID="columns" style={styles.row}>
      {sideAt === "start" ? [beside, main] : [main, beside]}
    </View>
  );
}

/**
 * On a page, a part that keeps the width of a column, at the page's left:
 * what a screen of two columns shows when it has nothing to lay out, such
 * as a trip that could not be loaded. Back above it stays where it is on
 * the page.
 */
export function PageColumn({ children }: { readonly children: ReactNode }) {
  return (
    <View testID="page-column" style={styles.pageColumn}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  pageColumn: { width: "100%", maxWidth: maxContentWidth, gap: spacing.md },
  stack: { flexDirection: "column", gap: spacing.md },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.lg },
  // `minWidth`: long text in the main column wraps, and does not push the side column out.
  main: { flex: 1, minWidth: 0, gap: spacing.md },
  part: { gap: spacing.md },
});
