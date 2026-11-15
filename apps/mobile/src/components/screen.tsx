import type { ReactNode } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  controlOutline,
  edges,
  maxContentWidth,
  radii,
  sidePanelFrom,
  sidePanelWidth,
  spacing,
} from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * A full screen with safe-area padding. On wide screens (web, tablets) the
 * content sits in a centred column (spec 1, section 5). A `footer`, such as
 * a step's main button, stays at the bottom while the rest scrolls: the
 * `BottomBar` of spec 15, section 5.2. With `footerBeside`, wide screens
 * show the footer in a panel beside the column instead (section 4.8).
 */
export function Screen({
  children,
  footer,
  footerBeside = false,
}: {
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly footerBeside?: boolean;
}) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const beside = footer !== undefined && footerBeside && width >= sidePanelFrom;
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}>
      {/* "handled": with the keyboard open, a tap on a button acts at once. */}
      <ScrollView
        testID="screen-scroll"
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {beside ? (
          <View style={styles.wide}>
            <View style={styles.wideColumn}>{children}</View>
            <View
              testID="side-panel"
              style={[
                styles.panel,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                  borderBottomColor: palette.edge,
                },
              ]}
            >
              {footer}
            </View>
          </View>
        ) : (
          <View style={styles.column}>{children}</View>
        )}
      </ScrollView>
      {footer === undefined || beside ? null : (
        <View
          testID="bottom-bar"
          style={[styles.bar, { backgroundColor: palette.surface, borderTopColor: palette.border }]}
        >
          <View style={styles.barColumn}>{footer}</View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: "center", padding: spacing.md },
  column: { flex: 1, width: "100%", maxWidth: maxContentWidth, gap: spacing.md },
  bar: { borderTopWidth: controlOutline, padding: spacing.md, alignItems: "center" },
  barColumn: { width: "100%", maxWidth: maxContentWidth, gap: spacing.sm },
  wide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.lg,
    width: "100%",
    maxWidth: maxContentWidth + spacing.lg + sidePanelWidth,
  },
  wideColumn: { flex: 1, gap: spacing.md },
  panel: {
    width: sidePanelWidth,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radii.card,
    borderWidth: controlOutline,
    borderBottomWidth: edges.card,
  },
});
