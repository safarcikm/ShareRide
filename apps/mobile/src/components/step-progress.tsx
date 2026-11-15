import { StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/i18n/language";
import { radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * "Step 3 of 5" above a bar for each step (spec 15, `StepProgress`): the
 * steps up to this one in `primary`, the rest in `border`. Screen readers
 * hear the words; the bars are hidden from them.
 */
export function StepProgress({ step, total }: { readonly step: number; readonly total: number }) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <View style={styles.progress}>
      <Text style={[typography.caption, { color: palette.textMuted }]}>
        {t("trip.step", { step, total })}
      </Text>
      <View
        style={styles.bars}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            testID="step-bar"
            style={[
              styles.bar,
              { backgroundColor: index < step ? palette.primary : palette.border },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { flex: 1, gap: spacing.xs },
  bars: { flexDirection: "row", gap: spacing.xs },
  bar: { flex: 1, height: sizes.bar, borderRadius: radii.pill },
});
