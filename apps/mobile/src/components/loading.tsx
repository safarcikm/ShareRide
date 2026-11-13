import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useLanguage } from "@/i18n/language";
import { usePalette } from "@/theme/use-palette";

/** While the session is restored and the fonts load at start. */
export function Loading() {
  const palette = usePalette();
  const { t } = useLanguage();
  return (
    <View style={[styles.center, { backgroundColor: palette.background }]}>
      <ActivityIndicator
        accessibilityLabel={t("common.loading")}
        color={palette.primary}
        size="large"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
