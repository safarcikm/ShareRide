import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { minTouchTarget, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

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

/** A labelled text field; the label is always visible, never a placeholder. */
export function TextField({ label, value, onChangeText, help, error, ...input }: TextFieldProps) {
  const palette = usePalette();
  const hint = error ?? help;
  return (
    <View style={styles.field}>
      <Text style={[typography.label, { color: palette.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        aria-invalid={error !== undefined}
        value={value}
        onChangeText={onChangeText}
        style={[
          typography.body,
          styles.input,
          input.multiline === true && styles.multiline,
          {
            color: palette.text,
            borderColor: error === undefined ? palette.border : palette.error,
            backgroundColor: palette.background,
          },
        ]}
        {...input}
      />
      {hint === undefined ? null : (
        <Text
          accessibilityLiveRegion={error === undefined ? "none" : "polite"}
          style={[
            typography.small,
            { color: error === undefined ? palette.textMuted : palette.error },
          ]}
        >
          {hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  input: {
    minHeight: minTouchTarget,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multiline: { minHeight: 120, textAlignVertical: "top" },
});
