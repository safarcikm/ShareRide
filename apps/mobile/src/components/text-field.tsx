import { CircleAlert } from "lucide-react-native";
import { useId, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { controlOutline, iconSizes, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Icon } from "./icon";

interface TextFieldProps extends Pick<
  TextInputProps,
  | "keyboardType"
  | "autoComplete"
  | "textContentType"
  | "autoFocus"
  | "maxLength"
  | "multiline"
  | "onSubmitEditing"
  | "autoCapitalize"
> {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  /** Shown under the field, for format hints and limits. */
  readonly help?: string;
  /** Shown under the field in place of the help, and read out by screen readers. */
  readonly error?: string | undefined;
}

/**
 * A labelled text field; the label is always visible, never a placeholder
 * (spec 15, section 5.1). The outline turns moss while you type in it. An
 * error turns the outline and message red and puts an alert icon before the
 * message, so it does not rely on colour alone.
 */
export function TextField({ label, value, onChangeText, help, error, ...input }: TextFieldProps) {
  const palette = usePalette();
  const hint = error ?? help;
  const hasError = error !== undefined;
  const [focused, setFocused] = useState(false);
  // Phones read the hint from accessibilityHint; the web drops it, so there
  // the field points to the hint text instead.
  const hintId = useId();
  const describedBy: object =
    Platform.OS === "web" && hint !== undefined ? { "aria-describedby": hintId } : {};
  const outline = hasError ? palette.error : focused ? palette.primary : palette.control;
  return (
    <View style={styles.field}>
      <Text style={[typography.label, { color: palette.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        aria-invalid={hasError}
        {...describedBy}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
        }}
        style={[
          typography.body,
          styles.input,
          input.multiline === true && styles.multiline,
          {
            color: palette.text,
            borderColor: outline,
            backgroundColor: palette.surface,
          },
        ]}
        {...input}
      />
      {hint === undefined ? null : (
        <View style={styles.hint}>
          {hasError ? (
            <Icon
              icon={CircleAlert}
              color={palette.error}
              size={iconSizes.inline}
              testID="field-error-icon"
            />
          ) : null}
          <Text
            nativeID={hintId}
            accessibilityLiveRegion={hasError ? "polite" : "none"}
            style={[
              typography.small,
              styles.hintText,
              { color: hasError ? palette.error : palette.textMuted },
            ]}
          >
            {hint}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  input: {
    minHeight: sizes.inputHeight,
    borderWidth: controlOutline,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.ms,
  },
  multiline: { minHeight: 120, textAlignVertical: "top" },
  hint: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  hintText: { flex: 1 },
});
