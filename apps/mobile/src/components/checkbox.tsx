import { Pressable, StyleSheet, Text, View } from "react-native";
import { minTouchTarget, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

interface CheckboxProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

/** A tick box with its label; the whole row is the touch target. */
export function Checkbox({ label, checked, onChange }: CheckboxProps) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={() => {
        onChange(!checked);
      }}
      style={styles.row}
    >
      <View
        style={[
          styles.box,
          { borderColor: checked ? palette.primary : palette.border },
          checked && { backgroundColor: palette.primary },
        ]}
      >
        {checked ? <Text style={[styles.tick, { color: palette.onPrimary }]}>✓</Text> : null}
      </View>
      <Text style={[typography.body, styles.label, { color: palette.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: minTouchTarget },
  box: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  tick: { fontSize: 18, fontWeight: "700" },
  label: { flex: 1 },
});
