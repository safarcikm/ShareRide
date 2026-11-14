import { Check } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  controlOutline,
  iconSizes,
  minTouchTarget,
  radii,
  sizes,
  spacing,
  typography,
} from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Icon } from "./icon";

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
        testID="checkbox-box"
        style={[
          styles.box,
          checked
            ? {
                backgroundColor: palette.primary,
                borderColor: palette.primary,
                borderBottomColor: palette.primaryEdge,
              }
            : { backgroundColor: palette.surface, borderColor: palette.control },
        ]}
      >
        {checked ? (
          <Icon
            icon={Check}
            color={palette.onPrimary}
            size={iconSizes.inline}
            testID="checkbox-tick"
          />
        ) : null}
      </View>
      <Text style={[typography.body, styles.label, { color: palette.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.ms, minHeight: minTouchTarget },
  box: {
    width: sizes.checkbox,
    height: sizes.checkbox,
    borderWidth: controlOutline,
    borderRadius: radii.checkbox,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { flex: 1 },
});
