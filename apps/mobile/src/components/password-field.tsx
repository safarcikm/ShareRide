import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLanguage } from "@/i18n/language";
import { spacing } from "@/theme/tokens";
import { Button } from "./button";
import { TextField } from "./text-field";

/**
 * A password field (spec 27, 3.1 and 3.5): hidden as typed, with "Show"
 * under it, which stands in for typing a new one twice. Browsers and
 * phones fill it: the current password at sign-in, a new one they may make
 * and keep when choosing one.
 */
export function PasswordField({
  label,
  value,
  onChangeText,
  help,
  error,
  purpose,
  onSubmitEditing,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly help?: string;
  readonly error?: string | undefined;
  /** Signing in with the password, or choosing a new one. */
  readonly purpose: "current" | "new";
  readonly onSubmitEditing?: () => void;
}) {
  const { t } = useLanguage();
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.field}>
      <TextField
        label={label}
        value={value}
        onChangeText={onChangeText}
        help={help}
        error={error}
        secureTextEntry={!shown}
        autoComplete={purpose === "new" ? "new-password" : "current-password"}
        textContentType={purpose === "new" ? "newPassword" : "password"}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={onSubmitEditing}
      />
      <View style={styles.show}>
        <Button
          variant="text"
          label={t(shown ? "auth.password.hide" : "auth.password.show")}
          accessibilityLabel={t(shown ? "auth.password.hideLabel" : "auth.password.showLabel")}
          onPress={() => {
            setShown(!shown);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  show: { alignItems: "flex-start" },
});
