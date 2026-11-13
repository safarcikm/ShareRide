import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { maxContentWidth, spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * A full screen with safe-area padding. On wide screens (web, tablets) the
 * content sits in a centred column (spec 1, section 5).
 */
export function Screen({ children }: { readonly children: ReactNode }) {
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: "center", padding: spacing.md },
  column: { flex: 1, width: "100%", maxWidth: maxContentWidth, gap: spacing.md },
});
