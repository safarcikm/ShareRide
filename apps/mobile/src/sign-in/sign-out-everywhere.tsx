import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSignOut } from "@/auth/use-sign-out";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { spacing } from "@/theme/tokens";

/**
 * "Sign out on all devices", at the end of Sign-in methods (spec 31, 3.14
 * item 1): for a lost phone or a device other people use. Once signed out,
 * the screen around it closes back to Find by itself. When it fails, the
 * person stays signed in and it says why, so they can try again.
 */
export function SignOutEverywhere() {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const { signingOut, signOut } = useSignOut({ onError: setError });
  return (
    <View style={styles.part}>
      <Button
        variant="secondary"
        label={t("settings.signOutAll")}
        busy={signingOut === "all"}
        onPress={() => void signOut(true)}
      />
      <Body align="start">{t("settings.signOutAllHelp")}</Body>
      <Notice message={error} />
    </View>
  );
}

const styles = StyleSheet.create({ part: { gap: spacing.sm, marginTop: spacing.md } });
