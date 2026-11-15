import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/button";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { spacing } from "@/theme/tokens";

/**
 * A place of the menu while signed out (spec 16, 3.1, item 3): what it is
 * for and a way to sign in, so the menu is the same signed in or out.
 * `onSignIn` replaces plain signing in, for Offer, which keeps the offer.
 */
export function SignInFirst({
  title,
  body,
  signInLabel,
  onSignIn,
  children,
}: {
  readonly title: string;
  readonly body?: string;
  readonly signInLabel?: string;
  readonly onSignIn?: () => void;
  readonly children?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <Screen>
      <View style={styles.intro}>
        <Title>{title}</Title>
        {body === undefined ? null : <Body>{body}</Body>}
      </View>
      <Button
        label={signInLabel ?? t("welcome.signIn")}
        onPress={
          onSignIn ??
          (() => {
            router.push("/sign-in");
          })
        }
      />
      {children}
    </Screen>
  );
}

const styles = StyleSheet.create({ intro: { gap: spacing.md, paddingVertical: spacing.lg } });
