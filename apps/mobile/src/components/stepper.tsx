import { Minus, Plus, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from "react-native";
import { chunky } from "@/theme/pressable";
import { controlOutline, edges, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Icon } from "./icon";

/** A 48 square secondary button with a minus or plus (spec 15, `Stepper`). */
export function StepButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled: boolean;
}) {
  const palette = usePalette();
  const edge = disabled ? 0 : edges.buttonSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.buttonOuter, chunky(edge, palette.edge, pressed).outer]}
    >
      {({ pressed }) => (
        <View
          testID="step-button-face"
          style={[
            styles.buttonFace,
            disabled
              ? { backgroundColor: palette.border, borderColor: palette.border }
              : { backgroundColor: palette.surface, borderColor: palette.control },
            chunky(edge, palette.edge, pressed).face,
          ]}
        >
          <Icon icon={icon} color={disabled ? palette.textMuted : palette.text} />
        </View>
      )}
    </Pressable>
  );
}

interface AdjustableProps {
  /** What is adjusted, such as "Seats offered". */
  readonly label: string;
  readonly value: number;
  /** The value in words for screen readers, such as "3 seats". */
  readonly valueText: string;
  readonly canDecrease: boolean;
  readonly canIncrease: boolean;
  readonly onDecrease: () => void;
  readonly onIncrease: () => void;
  readonly children: ReactNode;
}

/**
 * Phones read a control with minus and plus as one adjustable element:
 * swipe up or down to change it, and hear its value. The web has no such
 * role for a group, so there the buttons stay separate and the value is
 * read out when it changes.
 */
export function Adjustable({
  label,
  value,
  valueText,
  canDecrease,
  canIncrease,
  onDecrease,
  onIncrease,
  children,
}: AdjustableProps) {
  if (Platform.OS === "web") return <View>{children}</View>;
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ now: value, text: valueText }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event: AccessibilityActionEvent) => {
        if (event.nativeEvent.actionName === "increment" && canIncrease) onIncrease();
        if (event.nativeEvent.actionName === "decrement" && canDecrease) onDecrease();
      }}
    >
      {children}
    </View>
  );
}

/**
 * A whole number with minus and plus, such as the seats offered (spec 15,
 * `Stepper`): the label above, the value in `figure` between the buttons.
 */
export function Stepper({
  label,
  hint,
  beside = false,
  value,
  min,
  max,
  onChange,
  valueText,
  fewerLabel,
  moreLabel,
}: {
  readonly label: string;
  /** A line under the label, such as the price per seat. */
  readonly hint?: string;
  /** The label on the left and the buttons on the right, in one row. */
  readonly beside?: boolean;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
  readonly valueText: string;
  readonly fewerLabel: string;
  readonly moreLabel: string;
}) {
  const palette = usePalette();
  const decrease = () => {
    onChange(Math.max(min, value - 1));
  };
  const increase = () => {
    onChange(Math.min(max, value + 1));
  };
  return (
    <View style={beside ? styles.beside : styles.stepper}>
      <View style={beside ? styles.grow : undefined}>
        <Text style={[typography.label, { color: palette.text }]}>{label}</Text>
        {hint === undefined ? null : (
          <Text style={[typography.small, { color: palette.textMuted }]}>{hint}</Text>
        )}
      </View>
      <Adjustable
        label={label}
        value={value}
        valueText={valueText}
        canDecrease={value > min}
        canIncrease={value < max}
        onDecrease={decrease}
        onIncrease={increase}
      >
        <View style={styles.row}>
          <StepButton icon={Minus} label={fewerLabel} onPress={decrease} disabled={value <= min} />
          <Text
            testID="stepper-value"
            accessibilityLiveRegion="polite"
            aria-label={Platform.OS === "web" ? valueText : undefined}
            style={[typography.figure, styles.value, { color: palette.text }]}
          >
            {value}
          </Text>
          <StepButton icon={Plus} label={moreLabel} onPress={increase} disabled={value >= max} />
        </View>
      </Adjustable>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { gap: spacing.sm },
  beside: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  grow: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  value: { minWidth: sizes.buttonHeight, textAlign: "center" },
  buttonOuter: {
    width: sizes.buttonHeight,
    height: sizes.buttonHeight,
    borderRadius: radii.control,
  },
  buttonFace: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.control,
    borderWidth: controlOutline,
  },
});
