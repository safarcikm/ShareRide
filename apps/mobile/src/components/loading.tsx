import { ActivityIndicator, StyleSheet, View } from "react-native";
import { usePalette } from "@/theme/use-palette";

/** While the session is being restored at start. */
export function Loading() {
  const palette = usePalette();
  return (
    <View style={[styles.center, { backgroundColor: palette.background }]}>
      <ActivityIndicator color={palette.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
