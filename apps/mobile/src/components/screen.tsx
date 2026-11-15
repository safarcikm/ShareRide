import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { controlOutline, maxContentWidth, spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * A full screen with safe-area padding. On wide screens (web, tablets) the
 * content sits in a centred column (spec 1, section 5). A `footer`, such as
 * a step's main button, stays at the bottom while the rest scrolls: the
 * `BottomBar` of spec 15, section 5.2.
 */
export function Screen({
  children,
  footer,
}: {
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  const palette = usePalette();
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}>
      {/* "handled": with the keyboard open, a tap on a button acts at once. */}
      <ScrollView
        testID="screen-scroll"
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.column}>{children}</View>
      </ScrollView>
      {footer === undefined ? null : (
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
});
