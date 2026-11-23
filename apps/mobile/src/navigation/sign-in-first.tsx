import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { PuffinByPin } from "@/components/puffin-scenes";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { sizes, spacing } from "@/theme/tokens";

/**
 * A place of the menu while signed out (spec 16, 3.1, item 3): what it is
 * for and a way to sign in, so the menu is the same signed in or out.
 * `onSignIn` replaces plain signing in, for Offer, which keeps the offer.
 * `back` is for a screen opened on top of the menu, which needs a way back:
 * where Back leads when there is nothing behind it. A place of the menu has
 * the puffin by its pin over its title, as an empty screen does (spec 15,
 * 5.3); a screen on top has not.
 */
export function SignInFirst({
  title,
  body,
  signInLabel,
  onSignIn,
  back,
  children,
}: {
  readonly title: string;
  readonly body?: string;
  readonly signInLabel?: string;
  readonly onSignIn?: () => void;
  readonly back?: Href;
  readonly children?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <Screen>
      {back === undefined ? null : <BackButton fallback={back} />}
      <View style={styles.intro}>
        {back === undefined ? <PuffinByPin height={sizes.scenePuffin} /> : null}
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
